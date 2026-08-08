use quick_xml::{events::Event, Reader};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use wasm_bindgen::prelude::*;

const MIN_SCALE: f64 = 0.15;
const MAX_SCALE: f64 = 5.0;

/// Rounds a world-coordinate to the nearest grid intersection.
#[wasm_bindgen]
pub fn snap_to_grid(value: f64, grid_size: f64) -> f64 {
    if !value.is_finite() || !grid_size.is_finite() || grid_size <= 0.0 {
        return value;
    }

    (value / grid_size).round() * grid_size
}

/// Keeps the viewport scale inside the supported zoom range.
#[wasm_bindgen]
pub fn clamp_scale(value: f64) -> f64 {
    if !value.is_finite() {
        return 1.0;
    }

    value.clamp(MIN_SCALE, MAX_SCALE)
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BpmnModel {
    nodes: Vec<BpmnNode>,
    flows: Vec<BpmnFlow>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BpmnNode {
    id: String,
    #[serde(rename = "type")]
    node_type: BpmnNodeType,
    #[serde(default)]
    pool_id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    duration_ms: Option<u64>,
    #[serde(default)]
    duration_distribution: BpmnDurationDistribution,
    #[serde(default)]
    duration_min_ms: Option<u64>,
    #[serde(default)]
    duration_mode_ms: Option<u64>,
    #[serde(default)]
    duration_max_ms: Option<u64>,
    #[serde(default)]
    resource_role: Option<String>,
    #[serde(default)]
    cost_per_hour: Option<f64>,
    #[serde(default)]
    resource_capacity: Option<u32>,
    #[serde(default)]
    x: Option<f64>,
    #[serde(default)]
    y: Option<f64>,
    #[serde(default)]
    width: Option<f64>,
    #[serde(default)]
    height: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BpmnFlow {
    id: String,
    source_id: String,
    target_id: String,
    #[serde(default)]
    flow_type: BpmnFlowType,
    #[serde(default)]
    condition: Option<String>,
    #[serde(default)]
    probability: Option<f64>,
    #[serde(default)]
    is_default: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum BpmnNodeType {
    StartEvent,
    EndEvent,
    IntermediateEvent,
    Task,
    ServiceTask,
    UserTask,
    XorGateway,
    AndGateway,
    OrGateway,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
enum BpmnDurationDistribution {
    #[default]
    Fixed,
    Uniform,
    Triangular,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
enum BpmnFlowType {
    #[default]
    Sequence,
    Message,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BpmnValidationResult {
    valid: bool,
    issues: Vec<BpmnIssue>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BpmnIssue {
    severity: IssueSeverity,
    code: &'static str,
    message: String,
    element_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum IssueSeverity {
    Error,
    Warning,
}

impl BpmnValidationResult {
    fn new() -> Self {
        Self {
            valid: true,
            issues: Vec::new(),
        }
    }

    fn error(&mut self, code: &'static str, message: impl Into<String>, element_id: Option<&str>) {
        self.valid = false;
        self.issues.push(BpmnIssue {
            severity: IssueSeverity::Error,
            code,
            message: message.into(),
            element_id: element_id.map(str::to_owned),
        });
    }

    fn warning(
        &mut self,
        code: &'static str,
        message: impl Into<String>,
        element_id: Option<&str>,
    ) {
        self.issues.push(BpmnIssue {
            severity: IssueSeverity::Warning,
            code,
            message: message.into(),
            element_id: element_id.map(str::to_owned),
        });
    }
}

fn validate_bpmn_model(model: &BpmnModel) -> BpmnValidationResult {
    let mut result = BpmnValidationResult::new();
    let mut nodes_by_id = HashMap::new();
    let mut node_ids = HashSet::new();
    let mut flow_ids = HashSet::new();

    for node in &model.nodes {
        if node.id.trim().is_empty() {
            result.error("node-id-empty", "BPMN node ID cannot be empty.", None);
        } else if !node_ids.insert(node.id.as_str()) {
            result.error(
                "node-id-duplicate",
                format!("Node '{}' appears more than once.", node.id),
                Some(&node.id),
            );
        }
        if node.duration_distribution != BpmnDurationDistribution::Fixed {
            let min = node.duration_min_ms;
            let max = node.duration_max_ms;
            if min.is_none() || max.is_none() || min > max {
                result.error(
                    "duration-range-invalid",
                    "Duration distributions require minDurationMs and maxDurationMs with min less than or equal to max.",
                    Some(&node.id),
                );
            } else if node.duration_distribution == BpmnDurationDistribution::Triangular
                && !node.duration_mode_ms.is_some_and(|mode| mode >= min.unwrap() && mode <= max.unwrap())
            {
                result.error(
                    "duration-mode-invalid",
                    "Triangular duration distributions require modeDurationMs inside the min/max range.",
                    Some(&node.id),
                );
            }
        }
        if node.cost_per_hour.is_some_and(|cost| !cost.is_finite() || cost < 0.0) {
            result.error(
                "cost-per-hour-invalid",
                "Cost per hour must be a finite non-negative value.",
                Some(&node.id),
            );
        }
        nodes_by_id.insert(node.id.as_str(), node);
    }

    let mut incoming: HashMap<&str, Vec<&BpmnFlow>> = HashMap::new();
    let mut outgoing: HashMap<&str, Vec<&BpmnFlow>> = HashMap::new();
    for flow in &model.flows {
        if flow.id.trim().is_empty() {
            result.error("flow-id-empty", "BPMN flow ID cannot be empty.", None);
        } else if !flow_ids.insert(flow.id.as_str()) {
            result.error(
                "flow-id-duplicate",
                format!("Flow '{}' appears more than once.", flow.id),
                Some(&flow.id),
            );
        }

        let Some(source) = nodes_by_id.get(flow.source_id.as_str()) else {
            result.error(
                "flow-source-missing",
                format!(
                    "Flow '{}' has no existing source '{}'.",
                    flow.id, flow.source_id
                ),
                Some(&flow.id),
            );
            continue;
        };
        let Some(target) = nodes_by_id.get(flow.target_id.as_str()) else {
            result.error(
                "flow-target-missing",
                format!(
                    "Flow '{}' has no existing target '{}'.",
                    flow.id, flow.target_id
                ),
                Some(&flow.id),
            );
            continue;
        };

        if flow.flow_type == BpmnFlowType::Sequence && source.pool_id != target.pool_id {
            result.error(
                "sequence-flow-crosses-pool",
                format!(
                    "Sequence flow '{}' crosses pools; use a message flow instead.",
                    flow.id
                ),
                Some(&flow.id),
            );
        }

        incoming
            .entry(flow.target_id.as_str())
            .or_default()
            .push(flow);
        outgoing
            .entry(flow.source_id.as_str())
            .or_default()
            .push(flow);
    }

    let starts: Vec<&BpmnNode> = model
        .nodes
        .iter()
        .filter(|node| node.node_type == BpmnNodeType::StartEvent)
        .collect();
    if starts.is_empty() {
        result.error(
            "start-event-missing",
            "A BPMN process needs at least one start event.",
            None,
        );
    }

    for node in &model.nodes {
        let inbound = incoming.get(node.id.as_str()).map_or(0, Vec::len);
        let outbound = outgoing.get(node.id.as_str()).map_or(0, Vec::len);
        match node.node_type {
            BpmnNodeType::StartEvent => {
                if inbound > 0 {
                    result.error(
                        "start-event-has-incoming",
                        "A start event cannot have incoming flow.",
                        Some(&node.id),
                    );
                }
                if outbound == 0 {
                    result.error(
                        "start-event-has-no-outgoing",
                        "A start event needs an outgoing flow.",
                        Some(&node.id),
                    );
                }
            }
            BpmnNodeType::EndEvent => {
                if outbound > 0 {
                    result.error(
                        "end-event-has-outgoing",
                        "An end event cannot have outgoing flow.",
                        Some(&node.id),
                    );
                }
                if inbound == 0 {
                    result.error(
                        "end-event-has-no-incoming",
                        "An end event needs an incoming flow.",
                        Some(&node.id),
                    );
                }
            }
            BpmnNodeType::XorGateway | BpmnNodeType::AndGateway | BpmnNodeType::OrGateway => {
                if inbound <= 1 && outbound < 2 {
                    result.warning(
                        "gateway-not-splitting",
                        "A splitting gateway normally has at least two outgoing flows.",
                        Some(&node.id),
                    );
                }
                if outbound <= 1 && inbound < 2 {
                    result.warning(
                        "gateway-not-joining",
                        "A joining gateway normally has at least two incoming flows.",
                        Some(&node.id),
                    );
                }
            }
            _ => {}
        }

        if node.node_type == BpmnNodeType::XorGateway {
            let sequence_flows: Vec<&BpmnFlow> = outgoing
                .get(node.id.as_str())
                .into_iter()
                .flatten()
                .filter(|flow| flow.flow_type == BpmnFlowType::Sequence)
                .copied()
                .collect();
            let defaults: Vec<&BpmnFlow> = sequence_flows
                .iter()
                .copied()
                .filter(|flow| flow.is_default)
                .collect();
            if defaults.len() > 1 {
                result.error(
                    "xor-multiple-default-flows",
                    "An XOR gateway can have only one default sequence flow.",
                    Some(&node.id),
                );
            }
            let probability_sum: f64 = sequence_flows
                .iter()
                .filter_map(|flow| flow.probability)
                .sum();
            if sequence_flows.iter().any(|flow| {
                flow.probability
                    .is_some_and(|value| !value.is_finite() || !(0.0..=1.0).contains(&value))
            }) {
                result.error(
                    "xor-probability-invalid",
                    "XOR sequence-flow probabilities must be finite values from 0 to 1.",
                    Some(&node.id),
                );
            } else if probability_sum > 1.0 + f64::EPSILON {
                result.error(
                    "xor-probability-sum",
                    "XOR sequence-flow probabilities cannot sum to more than 1.",
                    Some(&node.id),
                );
            }
        } else if let Some(flow) = outgoing
            .get(node.id.as_str())
            .into_iter()
            .flatten()
            .find(|flow| flow.is_default)
        {
            result.warning(
                "default-flow-non-xor",
                "Default-flow selection is currently supported only for XOR gateways.",
                Some(&flow.id),
            );
        }
    }

    let mut reachable = HashSet::new();
    let mut queue: VecDeque<&str> = starts.iter().map(|node| node.id.as_str()).collect();
    while let Some(id) = queue.pop_front() {
        if !reachable.insert(id) {
            continue;
        }
        if let Some(flows) = outgoing.get(id) {
            for flow in flows {
                queue.push_back(flow.target_id.as_str());
            }
        }
    }
    for node in &model.nodes {
        if !reachable.contains(node.id.as_str()) {
            result.warning(
                "node-unreachable",
                "This BPMN node is unreachable from every start event.",
                Some(&node.id),
            );
        }
    }

    result
}

/// Validates a compact BPMN graph. The input and output are JSON strings to
/// keep the browser/WASM boundary stable and easy to persist in a CRDT.
#[wasm_bindgen]
pub fn validate_bpmn(model_json: &str) -> String {
    let result = match serde_json::from_str::<BpmnModel>(model_json) {
        Ok(model) => validate_bpmn_model(&model),
        Err(error) => {
            let mut validation = BpmnValidationResult::new();
            validation.error(
                "model-json-invalid",
                format!("Could not parse BPMN model JSON: {error}"),
                None,
            );
            validation
        }
    };

    serde_json::to_string(&result).expect("BPMN validation result must serialize")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BpmnRunResult {
    completed: bool,
    token_path: Vec<String>,
    estimated_duration_ms: u64,
    estimated_cost: f64,
    role_workload_ms: HashMap<String, u64>,
    role_capacity: HashMap<String, u32>,
    role_waiting_ms: HashMap<String, u64>,
}

fn fixed_duration_ms(node: &BpmnNode) -> u64 {
    node.duration_ms.unwrap_or(match node.node_type {
        BpmnNodeType::Task | BpmnNodeType::ServiceTask | BpmnNodeType::UserTask => 1_000,
        _ => 0,
    })
}

fn next_random_unit(state: &mut u64) -> f64 {
    *state = state
        .wrapping_mul(6_364_136_223_846_793_005)
        .wrapping_add(1_442_695_040_888_963_407);
    ((*state >> 11) as f64) / ((1u64 << 53) as f64)
}

fn sampled_duration_ms(node: &BpmnNode, random_state: &mut Option<u64>) -> u64 {
    let Some(state) = random_state else {
        return match node.duration_distribution {
            BpmnDurationDistribution::Triangular => node.duration_mode_ms.unwrap_or_else(|| fixed_duration_ms(node)),
            _ => fixed_duration_ms(node),
        };
    };
    let min = node.duration_min_ms.unwrap_or_else(|| fixed_duration_ms(node));
    let max = node.duration_max_ms.unwrap_or_else(|| fixed_duration_ms(node));
    match node.duration_distribution {
        BpmnDurationDistribution::Fixed => fixed_duration_ms(node),
        BpmnDurationDistribution::Uniform => {
            min.saturating_add((next_random_unit(state) * (max.saturating_sub(min) as f64 + 1.0)) as u64)
                .min(max)
        }
        BpmnDurationDistribution::Triangular => {
            let mode = node.duration_mode_ms.unwrap_or(min).clamp(min, max);
            let sample = next_random_unit(state);
            let span = max.saturating_sub(min) as f64;
            let pivot = if max == min { 0.0 } else { (mode.saturating_sub(min) as f64) / span };
            if sample <= pivot {
                min.saturating_add((sample * span * mode.saturating_sub(min) as f64).sqrt() as u64)
            } else {
                max.saturating_sub((((1.0 - sample) * span * max.saturating_sub(mode) as f64).sqrt()) as u64)
            }
        }
    }
}

fn select_flow<'a>(
    node: &BpmnNode,
    flows: &'a [&'a BpmnFlow],
    random_state: &mut Option<u64>,
) -> &'a BpmnFlow {
    if node.node_type != BpmnNodeType::XorGateway {
        return flows[0];
    }
    if let Some(flow) = flows.iter().find(|flow| {
        flow.condition
            .as_deref()
            .is_some_and(|condition| condition.trim().eq_ignore_ascii_case("true"))
    }) {
        return flow;
    }
    if let Some(state) = random_state {
        let total_probability: f64 = flows.iter().filter_map(|flow| flow.probability).sum();
        if total_probability > 0.0 {
            let random_value = next_random_unit(state);
            let mut cumulative_probability = 0.0;
            for flow in flows.iter().filter(|flow| flow.probability.is_some()) {
                cumulative_probability += flow.probability.unwrap_or_default();
                if random_value < cumulative_probability {
                    return flow;
                }
            }
        }
    }
    flows
        .iter()
        .find(|flow| flow.is_default)
        .copied()
        .unwrap_or(flows[0])
}

fn parse_and_validate_bpmn(model_json: &str) -> Result<BpmnModel, JsValue> {
    let model: BpmnModel = serde_json::from_str(model_json)
        .map_err(|error| JsValue::from_str(&format!("Could not parse BPMN model JSON: {error}")))?;
    let validation = validate_bpmn_model(&model);
    let errors: Vec<&BpmnIssue> = validation
        .issues
        .iter()
        .filter(|issue| issue.severity == IssueSeverity::Error)
        .collect();
    if !errors.is_empty() {
        return Err(JsValue::from_str(
            "Cannot run BPMN model until validation errors are resolved.",
        ));
    }
    Ok(model)
}

/// Executes a BPMN process. Supplying a random state enables seeded
/// probability selection for XOR gateways.
fn run_bpmn_model(
    model: &BpmnModel,
    random_state: &mut Option<u64>,
) -> Result<BpmnRunResult, JsValue> {
    let nodes_by_id: HashMap<&str, &BpmnNode> = model
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect();
    let mut outgoing: HashMap<&str, Vec<&BpmnFlow>> = HashMap::new();
    let mut incoming: HashMap<&str, Vec<&BpmnFlow>> = HashMap::new();
    for flow in &model.flows {
        if flow.flow_type == BpmnFlowType::Sequence {
            outgoing
                .entry(flow.source_id.as_str())
                .or_default()
                .push(flow);
            incoming
                .entry(flow.target_id.as_str())
                .or_default()
                .push(flow);
        }
    }
    let start = model
        .nodes
        .iter()
        .find(|node| node.node_type == BpmnNodeType::StartEvent)
        .ok_or_else(|| JsValue::from_str("Cannot run BPMN model without a start event."))?;

    let mut active_tokens = VecDeque::from([(start.id.as_str(), 0u64)]);
    let mut waiting_at_parallel_join: HashMap<&str, (usize, u64)> = HashMap::new();
    let mut token_path = Vec::new();
    let mut completed_tokens = 0usize;
    let mut estimated_duration_ms = 0u64;
    let mut estimated_cost = 0.0;
    let mut role_workload_ms = HashMap::new();
    let mut role_capacity = HashMap::new();
    let mut role_waiting_ms = HashMap::new();
    let mut resource_slots: HashMap<String, Vec<u64>> = HashMap::new();
    let step_limit = model.nodes.len().saturating_mul(model.flows.len().max(1)).saturating_mul(4);

    for _ in 0..=step_limit {
        let Some((current_id, arrived_at_ms)) = active_tokens.pop_front() else {
            if waiting_at_parallel_join.is_empty() && completed_tokens > 0 {
                return Ok(BpmnRunResult {
                    completed: true,
                    token_path,
                    estimated_duration_ms,
                    estimated_cost,
                    role_workload_ms,
                    role_capacity,
                    role_waiting_ms,
                });
            }
            return Err(JsValue::from_str(
                "A parallel gateway is waiting for tokens from unfinished branches.",
            ));
        };
        token_path.push(current_id.to_owned());
        let current = nodes_by_id
            .get(current_id)
            .ok_or_else(|| JsValue::from_str("Token reached a missing BPMN node."))?;
        let sampled_duration_ms = sampled_duration_ms(current, random_state);
        let mut task_start_ms = arrived_at_ms;
        if let Some(role) = current.resource_role.as_deref().filter(|role| !role.trim().is_empty()) {
            let capacity = current.resource_capacity.unwrap_or(1).max(1) as usize;
            let slots = resource_slots.entry(role.to_owned()).or_insert_with(|| vec![0; capacity]);
            let slot_index = slots.iter().enumerate().min_by_key(|(_, finish)| *finish).map(|(index, _)| index).unwrap_or(0);
            task_start_ms = task_start_ms.max(slots[slot_index]);
            *role_waiting_ms.entry(role.to_owned()).or_default() += task_start_ms.saturating_sub(arrived_at_ms);
            slots[slot_index] = task_start_ms.saturating_add(sampled_duration_ms);
        }
        let completed_at_ms = task_start_ms.saturating_add(sampled_duration_ms);
        estimated_cost += sampled_duration_ms as f64 / 3_600_000.0 * current.cost_per_hour.unwrap_or(0.0);
        if let Some(role) = current.resource_role.as_deref().filter(|role| !role.trim().is_empty()) {
            *role_workload_ms.entry(role.to_owned()).or_default() += sampled_duration_ms;
            role_capacity
                .entry(role.to_owned())
                .and_modify(|capacity| *capacity = (*capacity).min(current.resource_capacity.unwrap_or(1).max(1)))
                .or_insert(current.resource_capacity.unwrap_or(1).max(1));
        }
        if current.node_type == BpmnNodeType::EndEvent {
            completed_tokens += 1;
            estimated_duration_ms = estimated_duration_ms.max(completed_at_ms);
            continue;
        }
        let flows = outgoing
            .get(current_id)
            .ok_or_else(|| {
                JsValue::from_str("The token reached a node without an outgoing sequence flow.")
            })?;
        if current.node_type == BpmnNodeType::AndGateway
            && incoming.get(current_id).map_or(0, Vec::len) > 1
        {
            let required = incoming.get(current_id).map_or(0, Vec::len);
            let waiting = waiting_at_parallel_join.entry(current_id).or_default();
            waiting.0 += 1;
            waiting.1 = waiting.1.max(completed_at_ms);
            if waiting.0 < required {
                continue;
            }
            let synchronized_at_ms = waiting.1;
            waiting_at_parallel_join.remove(current_id);
            if current.node_type == BpmnNodeType::AndGateway && flows.len() > 1 {
                for flow in flows {
                    active_tokens.push_back((flow.target_id.as_str(), synchronized_at_ms));
                }
            } else {
                active_tokens.push_back((select_flow(current, flows, random_state).target_id.as_str(), synchronized_at_ms));
            }
            continue;
        }

        if current.node_type == BpmnNodeType::AndGateway && flows.len() > 1 {
            for flow in flows {
                active_tokens.push_back((flow.target_id.as_str(), completed_at_ms));
            }
        } else {
            active_tokens.push_back((select_flow(current, flows, random_state).target_id.as_str(), completed_at_ms));
        }
    }

    Err(JsValue::from_str(
        "The BPMN runner exceeded its deterministic step limit. Add a terminating branch or use simulation controls.",
    ))
}

/// Executes a deterministic BPMN process. XOR gateways select literal `true`
/// conditions, then their default-flow, then the first declared flow.
#[wasm_bindgen]
pub fn run_bpmn(model_json: &str) -> Result<String, JsValue> {
    let model = parse_and_validate_bpmn(model_json)?;
    serde_json::to_string(&run_bpmn_model(&model, &mut None)?)
        .map_err(|error| JsValue::from_str(&format!("Could not serialize BPMN run: {error}")))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BpmnSimulationResult {
    seed: u64,
    runs: u32,
    completed_runs: u32,
    min_duration_ms: u64,
    mean_duration_ms: u64,
    standard_deviation_ms: u64,
    p50_duration_ms: u64,
    p90_duration_ms: u64,
    p95_duration_ms: u64,
    max_duration_ms: u64,
    mean_cost: f64,
    role_utilization: Vec<BpmnRoleUtilization>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BpmnRoleUtilization {
    role: String,
    capacity: u32,
    mean_workload_ms: u64,
    utilization: f64,
    mean_waiting_ms: u64,
}

fn percentile(values: &[u64], percentile: f64) -> u64 {
    let index = ((values.len() - 1) as f64 * percentile).ceil() as usize;
    values[index]
}

/// Runs a seeded, reproducible Monte Carlo simulation. Only XOR flows with
/// `probability` values consume random numbers; all other BPMN semantics remain
/// deterministic.
#[wasm_bindgen]
pub fn simulate_bpmn(model_json: &str, seed: u64, runs: u32) -> Result<String, JsValue> {
    if runs == 0 || runs > 10_000 {
        return Err(JsValue::from_str(
            "Simulation runs must be between 1 and 10000.",
        ));
    }
    let model = parse_and_validate_bpmn(model_json)?;
    let mut random_state = Some(seed);
    let mut durations = Vec::with_capacity(runs as usize);
    let mut costs = Vec::with_capacity(runs as usize);
    let mut role_workloads: HashMap<String, u128> = HashMap::new();
    let mut role_capacities: HashMap<String, u32> = HashMap::new();
    let mut role_waiting: HashMap<String, u128> = HashMap::new();
    for _ in 0..runs {
        let run = run_bpmn_model(&model, &mut random_state)?;
        durations.push(run.estimated_duration_ms);
        costs.push(run.estimated_cost);
        for (role, workload) in run.role_workload_ms {
            *role_workloads.entry(role).or_default() += workload as u128;
        }
        for (role, capacity) in run.role_capacity {
            role_capacities
                .entry(role)
                .and_modify(|current| *current = (*current).min(capacity))
                .or_insert(capacity);
        }
        for (role, waiting) in run.role_waiting_ms {
            *role_waiting.entry(role).or_default() += waiting as u128;
        }
    }
    durations.sort_unstable();
    let total_duration: u128 = durations.iter().map(|duration| *duration as u128).sum();
    let mean_duration_ms = (total_duration / runs as u128) as u64;
    let variance = durations
        .iter()
        .map(|duration| (*duration as f64 - mean_duration_ms as f64).powi(2))
        .sum::<f64>()
        / runs as f64;
    let mut role_utilization: Vec<BpmnRoleUtilization> = role_workloads
        .into_iter()
        .map(|(role, workload)| {
            let capacity = role_capacities.get(&role).copied().unwrap_or(1).max(1);
            let mean_workload_ms = (workload / runs as u128) as u64;
            let mean_waiting_ms = (role_waiting.get(&role).copied().unwrap_or(0) / runs as u128) as u64;
            BpmnRoleUtilization {
                utilization: if mean_duration_ms == 0 {
                    0.0
                } else {
                    mean_workload_ms as f64 / (mean_duration_ms as f64 * capacity as f64)
                },
                role,
                capacity,
                mean_workload_ms,
                mean_waiting_ms,
            }
        })
        .collect();
    role_utilization.sort_by(|left, right| right.utilization.total_cmp(&left.utilization));
    let result = BpmnSimulationResult {
        seed,
        runs,
        completed_runs: runs,
        min_duration_ms: durations[0],
        mean_duration_ms,
        standard_deviation_ms: variance.sqrt().round() as u64,
        p50_duration_ms: percentile(&durations, 0.50),
        p90_duration_ms: percentile(&durations, 0.90),
        p95_duration_ms: percentile(&durations, 0.95),
        max_duration_ms: *durations.last().expect("simulation has at least one run"),
        mean_cost: costs.iter().sum::<f64>() / runs as f64,
        role_utilization,
    };
    serde_json::to_string(&result)
        .map_err(|error| JsValue::from_str(&format!("Could not serialize BPMN simulation: {error}")))
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn bpmn_tag(node_type: &BpmnNodeType) -> &'static str {
    match node_type {
        BpmnNodeType::StartEvent => "bpmn:startEvent",
        BpmnNodeType::EndEvent => "bpmn:endEvent",
        BpmnNodeType::IntermediateEvent => "bpmn:intermediateCatchEvent",
        BpmnNodeType::Task => "bpmn:task",
        BpmnNodeType::ServiceTask => "bpmn:serviceTask",
        BpmnNodeType::UserTask => "bpmn:userTask",
        BpmnNodeType::XorGateway => "bpmn:exclusiveGateway",
        BpmnNodeType::AndGateway => "bpmn:parallelGateway",
        BpmnNodeType::OrGateway => "bpmn:inclusiveGateway",
    }
}

/// Exports a validated BPMN graph as portable BPMN 2.0 XML with BPMN-DI
/// coordinates when the model supplies them.
#[wasm_bindgen]
pub fn export_bpmn_xml(model_json: &str) -> Result<String, JsValue> {
    let model: BpmnModel = serde_json::from_str(model_json)
        .map_err(|error| JsValue::from_str(&format!("Could not parse BPMN model JSON: {error}")))?;
    let validation = validate_bpmn_model(&model);
    let errors: Vec<&BpmnIssue> = validation
        .issues
        .iter()
        .filter(|issue| issue.severity == IssueSeverity::Error)
        .collect();
    if !errors.is_empty() {
        let messages = errors
            .iter()
            .map(|issue| issue.message.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        return Err(JsValue::from_str(&format!(
            "Cannot export an invalid BPMN model: {messages}"
        )));
    }

    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="MiroBoard_Definitions"
                  targetNamespace="https://miroboard.app/bpmn">
  <bpmn:process id="MiroBoard_Process" isExecutable="false">
"#,
    );
    for node in &model.nodes {
        let name = node
            .name
            .as_deref()
            .filter(|name| !name.trim().is_empty())
            .map(|name| format!(r#" name="{}""#, escape_xml(name)))
            .unwrap_or_default();
        xml.push_str(&format!(
            r#"    <{} id="{}"{} />
"#,
            bpmn_tag(&node.node_type),
            escape_xml(&node.id),
            name,
        ));
    }
    for flow in &model.flows {
        let tag = match flow.flow_type {
            BpmnFlowType::Sequence => "bpmn:sequenceFlow",
            BpmnFlowType::Message => "bpmn:messageFlow",
        };
        xml.push_str(&format!(
            r#"    <{} id="{}" sourceRef="{}" targetRef="{}" />
"#,
            tag,
            escape_xml(&flow.id),
            escape_xml(&flow.source_id),
            escape_xml(&flow.target_id),
        ));
    }
    xml.push_str("  </bpmn:process>\n");
    let positioned_nodes: Vec<&BpmnNode> = model
        .nodes
        .iter()
        .filter(|node| {
            node.x.is_some() && node.y.is_some() && node.width.is_some() && node.height.is_some()
        })
        .collect();
    if !positioned_nodes.is_empty() {
        xml.push_str(
            r#"  <bpmndi:BPMNDiagram id="MiroBoard_Diagram">
    <bpmndi:BPMNPlane id="MiroBoard_Plane" bpmnElement="MiroBoard_Process">
"#,
        );
        for node in positioned_nodes {
            xml.push_str(&format!(
                r#"      <bpmndi:BPMNShape id="{}_di" bpmnElement="{}"><dc:Bounds x="{}" y="{}" width="{}" height="{}" /></bpmndi:BPMNShape>
"#,
                escape_xml(&node.id),
                escape_xml(&node.id),
                node.x.expect("positioned node"),
                node.y.expect("positioned node"),
                node.width.expect("positioned node"),
                node.height.expect("positioned node"),
            ));
        }
        let nodes_by_id: HashMap<&str, &BpmnNode> = model
            .nodes
            .iter()
            .map(|node| (node.id.as_str(), node))
            .collect();
        for flow in &model.flows {
            let (Some(source), Some(target)) = (
                nodes_by_id.get(flow.source_id.as_str()),
                nodes_by_id.get(flow.target_id.as_str()),
            ) else {
                continue;
            };
            let (Some(source_x), Some(source_y), Some(source_width), Some(source_height)) =
                (source.x, source.y, source.width, source.height)
            else {
                continue;
            };
            let (Some(target_x), Some(target_y), Some(target_width), Some(target_height)) =
                (target.x, target.y, target.width, target.height)
            else {
                continue;
            };
            xml.push_str(&format!(
                r#"      <bpmndi:BPMNEdge id="{}_di" bpmnElement="{}"><di:waypoint x="{}" y="{}" /><di:waypoint x="{}" y="{}" /></bpmndi:BPMNEdge>
"#,
                escape_xml(&flow.id),
                escape_xml(&flow.id),
                source_x + source_width / 2.0,
                source_y + source_height / 2.0,
                target_x + target_width / 2.0,
                target_y + target_height / 2.0,
            ));
        }
        xml.push_str("    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n");
    }
    xml.push_str("</bpmn:definitions>\n");
    Ok(xml)
}

fn imported_node_type(tag: &str) -> Option<BpmnNodeType> {
    match tag {
        "startEvent" => Some(BpmnNodeType::StartEvent),
        "endEvent" => Some(BpmnNodeType::EndEvent),
        "intermediateCatchEvent" | "intermediateThrowEvent" => {
            Some(BpmnNodeType::IntermediateEvent)
        }
        "task" => Some(BpmnNodeType::Task),
        "serviceTask" => Some(BpmnNodeType::ServiceTask),
        "userTask" => Some(BpmnNodeType::UserTask),
        "exclusiveGateway" => Some(BpmnNodeType::XorGateway),
        "parallelGateway" => Some(BpmnNodeType::AndGateway),
        "inclusiveGateway" => Some(BpmnNodeType::OrGateway),
        _ => None,
    }
}

fn local_xml_name(name: &[u8]) -> Result<&str, JsValue> {
    let raw = std::str::from_utf8(name)
        .map_err(|error| JsValue::from_str(&format!("Invalid XML element name: {error}")))?;
    Ok(raw.rsplit(':').next().unwrap_or(raw))
}

/// Imports the executable graph from BPMN 2.0 XML. Unsupported BPMN elements
/// are left untouched in the source file and omitted from the current editor.
#[wasm_bindgen]
pub fn import_bpmn_xml(xml: &str) -> Result<String, JsValue> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut nodes: Vec<BpmnNode> = Vec::new();
    let mut flows: Vec<BpmnFlow> = Vec::new();
    let mut buffer = Vec::new();
    let mut active_shape_element: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) | Ok(Event::Empty(element)) => {
                let element_name = element.name();
                let tag = local_xml_name(element_name.as_ref())?;
                let mut id = None;
                let mut name = None;
                let mut source_id = None;
                let mut target_id = None;
                let mut bpmn_element = None;
                let mut x = None;
                let mut y = None;
                let mut width = None;
                let mut height = None;
                for attribute in element.attributes().with_checks(false).flatten() {
                    let key = local_xml_name(attribute.key.as_ref())?;
                    let value = attribute
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|error| {
                            JsValue::from_str(&format!("Invalid XML attribute: {error}"))
                        })?
                        .into_owned();
                    match key {
                        "id" => id = Some(value),
                        "name" => name = Some(value),
                        "sourceRef" => source_id = Some(value),
                        "targetRef" => target_id = Some(value),
                        "bpmnElement" => bpmn_element = Some(value),
                        "x" => x = value.parse::<f64>().ok(),
                        "y" => y = value.parse::<f64>().ok(),
                        "width" => width = value.parse::<f64>().ok(),
                        "height" => height = value.parse::<f64>().ok(),
                        _ => {}
                    }
                }

                if tag == "BPMNShape" {
                    active_shape_element = bpmn_element;
                } else if tag == "Bounds" {
                    if let (Some(element_id), Some(x), Some(y), Some(width), Some(height)) =
                        (active_shape_element.as_deref(), x, y, width, height)
                    {
                        if let Some(node) = nodes.iter_mut().find(|node| node.id == element_id) {
                            node.x = Some(x);
                            node.y = Some(y);
                            node.width = Some(width);
                            node.height = Some(height);
                        }
                    }
                } else if let Some(node_type) = imported_node_type(tag) {
                    let id = id.ok_or_else(|| {
                        JsValue::from_str(&format!("BPMN {tag} is missing required id attribute."))
                    })?;
                    nodes.push(BpmnNode {
                        id,
                        node_type,
                        pool_id: None,
                        name,
                        duration_ms: None,
                        duration_distribution: BpmnDurationDistribution::Fixed,
                        duration_min_ms: None,
                        duration_mode_ms: None,
                        duration_max_ms: None,
                        resource_role: None,
                        cost_per_hour: None,
                        resource_capacity: None,
                        x: None,
                        y: None,
                        width: None,
                        height: None,
                    });
                } else if matches!(tag, "sequenceFlow" | "messageFlow") {
                    let id = id.ok_or_else(|| {
                        JsValue::from_str(&format!("BPMN {tag} is missing required id attribute."))
                    })?;
                    let source_id = source_id.ok_or_else(|| {
                        JsValue::from_str(&format!("BPMN flow '{id}' is missing sourceRef."))
                    })?;
                    let target_id = target_id.ok_or_else(|| {
                        JsValue::from_str(&format!("BPMN flow '{id}' is missing targetRef."))
                    })?;
                    flows.push(BpmnFlow {
                        id,
                        source_id,
                        target_id,
                        flow_type: if tag == "messageFlow" {
                            BpmnFlowType::Message
                        } else {
                            BpmnFlowType::Sequence
                        },
                        condition: None,
                        probability: None,
                        is_default: false,
                    });
                }
            }
            Ok(Event::End(element)) => {
                if local_xml_name(element.name().as_ref())? == "BPMNShape" {
                    active_shape_element = None;
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(JsValue::from_str(&format!(
                    "Could not parse BPMN XML: {error}"
                )));
            }
            _ => {}
        }
        buffer.clear();
    }

    if nodes.is_empty() {
        return Err(JsValue::from_str(
            "No supported BPMN nodes were found in the XML file.",
        ));
    }

    serde_json::to_string(&BpmnModel { nodes, flows })
        .map_err(|error| JsValue::from_str(&format!("Could not serialize imported BPMN: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snaps_coordinates_to_the_nearest_grid_line() {
        assert_eq!(snap_to_grid(13.0, 10.0), 10.0);
        assert_eq!(snap_to_grid(16.0, 10.0), 20.0);
    }

    #[test]
    fn preserves_values_when_grid_is_invalid() {
        assert_eq!(snap_to_grid(12.5, 0.0), 12.5);
    }

    #[test]
    fn clamps_zoom() {
        assert_eq!(clamp_scale(0.1), MIN_SCALE);
        assert_eq!(clamp_scale(6.0), MAX_SCALE);
        assert_eq!(clamp_scale(1.5), 1.5);
    }

    #[test]
    fn accepts_a_minimal_well_formed_process() {
        let model = BpmnModel {
            nodes: vec![
                BpmnNode {
                    id: "start".into(),
                    node_type: BpmnNodeType::StartEvent,
                    pool_id: Some("pool-a".into()),
                    name: Some("Start".into()),
                    duration_ms: None,
                    duration_distribution: BpmnDurationDistribution::Fixed,
                    duration_min_ms: None,
                    duration_mode_ms: None,
                    duration_max_ms: None,
                    resource_role: None,
                    cost_per_hour: None,
                    resource_capacity: None,
                    x: Some(10.0),
                    y: Some(20.0),
                    width: Some(36.0),
                    height: Some(36.0),
                },
                BpmnNode {
                    id: "task".into(),
                    node_type: BpmnNodeType::Task,
                    pool_id: Some("pool-a".into()),
                    name: Some("Review & approve".into()),
                    duration_ms: None,
                    duration_distribution: BpmnDurationDistribution::Fixed,
                    duration_min_ms: None,
                    duration_mode_ms: None,
                    duration_max_ms: None,
                    resource_role: None,
                    cost_per_hour: None,
                    resource_capacity: None,
                    x: Some(100.0),
                    y: Some(20.0),
                    width: Some(160.0),
                    height: Some(80.0),
                },
                BpmnNode {
                    id: "end".into(),
                    node_type: BpmnNodeType::EndEvent,
                    pool_id: Some("pool-a".into()),
                    name: Some("End".into()),
                    duration_ms: None,
                    duration_distribution: BpmnDurationDistribution::Fixed,
                    duration_min_ms: None,
                    duration_mode_ms: None,
                    duration_max_ms: None,
                    resource_role: None,
                    cost_per_hour: None,
                    resource_capacity: None,
                    x: Some(300.0),
                    y: Some(20.0),
                    width: Some(36.0),
                    height: Some(36.0),
                },
            ],
            flows: vec![
                BpmnFlow {
                    id: "flow-1".into(),
                    source_id: "start".into(),
                    target_id: "task".into(),
                    flow_type: BpmnFlowType::Sequence,
                    condition: None,
                    probability: None,
                    is_default: false,
                },
                BpmnFlow {
                    id: "flow-2".into(),
                    source_id: "task".into(),
                    target_id: "end".into(),
                    flow_type: BpmnFlowType::Sequence,
                    condition: None,
                    probability: None,
                    is_default: false,
                },
            ],
        };

        assert!(validate_bpmn_model(&model).valid);
    }

    #[test]
    fn reports_an_invalid_start_event() {
        let result = validate_bpmn(r#"{"nodes":[{"id":"start","type":"startEvent"}],"flows":[]}"#);

        assert!(result.contains("start-event-has-no-outgoing"));
    }

    #[test]
    fn runs_a_valid_process_from_start_to_end() {
        let run = run_bpmn(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"task","type":"task"},
                {"id":"end","type":"endEvent"}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"task"},
                {"id":"f2","sourceId":"task","targetId":"end"}
              ]
            }"#,
        )
        .expect("valid process should run");

        assert!(run.contains(r#""completed":true"#));
        assert!(run.contains(r#""tokenPath":["start","task","end"]"#));
    }

    #[test]
    fn runs_parallel_branches_and_synchronizes_at_join() {
        let run = run_bpmn(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"split","type":"andGateway"},
                {"id":"left","type":"task","durationMs":500},
                {"id":"right","type":"task","durationMs":2000},
                {"id":"join","type":"andGateway"},
                {"id":"end","type":"endEvent"}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"split"},
                {"id":"f2","sourceId":"split","targetId":"left"},
                {"id":"f3","sourceId":"split","targetId":"right"},
                {"id":"f4","sourceId":"left","targetId":"join"},
                {"id":"f5","sourceId":"right","targetId":"join"},
                {"id":"f6","sourceId":"join","targetId":"end"}
              ]
            }"#,
        )
        .expect("parallel process should run");

        assert!(run.contains(r#""completed":true"#));
        assert_eq!(run.matches(r#""join""#).count(), 2);
        assert_eq!(run.matches(r#""end""#).count(), 1);
        assert!(run.contains(r#""estimatedDurationMs":2000"#));
    }

    #[test]
    fn xor_runner_prefers_true_condition_then_default_flow() {
        let run = run_bpmn(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"gateway","type":"xorGateway"},
                {"id":"approved","type":"task"},
                {"id":"fallback","type":"task"},
                {"id":"end1","type":"endEvent"},
                {"id":"end2","type":"endEvent"}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"gateway"},
                {"id":"f2","sourceId":"gateway","targetId":"approved","condition":"true"},
                {"id":"f3","sourceId":"gateway","targetId":"fallback","isDefault":true},
                {"id":"f4","sourceId":"approved","targetId":"end1"},
                {"id":"f5","sourceId":"fallback","targetId":"end2"}
              ]
            }"#,
        )
        .expect("valid XOR process should run");

        assert!(run.contains(r#""approved""#));
        assert!(!run.contains(r#""fallback""#));
    }

    #[test]
    fn rejects_multiple_xor_default_flows() {
        let result = validate_bpmn(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"gateway","type":"xorGateway"},
                {"id":"left","type":"endEvent"},
                {"id":"right","type":"endEvent"}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"gateway"},
                {"id":"f2","sourceId":"gateway","targetId":"left","isDefault":true},
                {"id":"f3","sourceId":"gateway","targetId":"right","isDefault":true}
              ]
            }"#,
        );

        assert!(result.contains("xor-multiple-default-flows"));
    }

    #[test]
    fn seeded_simulation_is_reproducible() {
        let model = r#"{
          "nodes":[
            {"id":"start","type":"startEvent"},
            {"id":"gateway","type":"xorGateway"},
            {"id":"fast","type":"task","durationMs":1000},
            {"id":"slow","type":"task","durationMs":5000},
            {"id":"end1","type":"endEvent"},
            {"id":"end2","type":"endEvent"}
          ],
          "flows":[
            {"id":"f1","sourceId":"start","targetId":"gateway"},
            {"id":"f2","sourceId":"gateway","targetId":"fast","probability":0.5},
            {"id":"f3","sourceId":"gateway","targetId":"slow","probability":0.5},
            {"id":"f4","sourceId":"fast","targetId":"end1"},
            {"id":"f5","sourceId":"slow","targetId":"end2"}
          ]
        }"#;
        let first = simulate_bpmn(model, 42, 100).expect("simulation should run");
        let second = simulate_bpmn(model, 42, 100).expect("same seed should run");

        assert_eq!(first, second);
        assert!(first.contains(r#""runs":100"#));
        assert!(first.contains(r#""minDurationMs":1000"#));
        assert!(first.contains(r#""maxDurationMs":5000"#));
    }

    #[test]
    fn queues_parallel_tasks_that_share_a_single_resource_slot() {
        let model = r#"{
          "nodes":[
            {"id":"start","type":"startEvent"},
            {"id":"split","type":"andGateway"},
            {"id":"left","type":"task","durationMs":4000,"resourceRole":"operator","resourceCapacity":1},
            {"id":"right","type":"task","durationMs":3000,"resourceRole":"operator","resourceCapacity":1},
            {"id":"join","type":"andGateway"},
            {"id":"end","type":"endEvent"}
          ],
          "flows":[
            {"id":"f1","sourceId":"start","targetId":"split"},
            {"id":"f2","sourceId":"split","targetId":"left"},
            {"id":"f3","sourceId":"split","targetId":"right"},
            {"id":"f4","sourceId":"left","targetId":"join"},
            {"id":"f5","sourceId":"right","targetId":"join"},
            {"id":"f6","sourceId":"join","targetId":"end"}
          ]
        }"#;
        let result = simulate_bpmn(model, 42, 1).expect("queue model should simulate");

        assert!(result.contains(r#""maxDurationMs":7000"#));
        assert!(result.contains(r#""meanWaitingMs":4000"#));
    }

    #[test]
    fn validates_duration_distribution_ranges() {
        let result = validate_bpmn(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"task","type":"task","durationDistribution":"triangular","durationMinMs":3000,"durationModeMs":1000,"durationMaxMs":2000},
                {"id":"end","type":"endEvent"}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"task"},
                {"id":"f2","sourceId":"task","targetId":"end"}
              ]
            }"#,
        );

        assert!(result.contains("duration-range-invalid"));
    }

    #[test]
    fn rejects_sequence_flows_between_pools() {
        let result = validate_bpmn(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent","poolId":"a"},
                {"id":"end","type":"endEvent","poolId":"b"}
              ],
              "flows":[{"id":"f","sourceId":"start","targetId":"end","flowType":"sequence"}]
            }"#,
        );

        assert!(result.contains("sequence-flow-crosses-pool"));
    }

    #[test]
    fn exports_valid_bpmn_xml_with_escaped_names() {
        let xml = export_bpmn_xml(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent","name":"Start","x":10,"y":20,"width":36,"height":36},
                {"id":"task","type":"task","name":"Review & approve","x":100,"y":20,"width":160,"height":80},
                {"id":"end","type":"endEvent","name":"End","x":300,"y":20,"width":36,"height":36}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"task"},
                {"id":"f2","sourceId":"task","targetId":"end"}
              ]
            }"#,
        )
        .expect("valid process should export");

        assert!(xml.contains(r#"<bpmn:task id="task" name="Review &amp; approve" />"#));
        assert!(xml.contains(r#"<bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="task" />"#));
        assert!(xml.contains(r#"<bpmndi:BPMNShape id="task_di" bpmnElement="task">"#));
        assert!(xml.contains(r#"<dc:Bounds x="100" y="20" width="160" height="80" />"#));

        let round_trip = import_bpmn_xml(&xml).expect("exported BPMN should import");
        let model: BpmnModel =
            serde_json::from_str(&round_trip).expect("round-trip result is JSON");
        assert_eq!(model.nodes[1].x, Some(100.0));
        assert_eq!(model.nodes[1].width, Some(160.0));
    }

    #[test]
    fn imports_a_standard_bpmn_process() {
        let imported = import_bpmn_xml(
            r#"<?xml version="1.0" encoding="UTF-8"?>
            <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
              <bpmn:process id="p">
                <bpmn:startEvent id="start" name="Start" />
                <bpmn:task id="task" name="Review" />
                <bpmn:endEvent id="end" name="End" />
                <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="task" />
                <bpmn:sequenceFlow id="f2" sourceRef="task" targetRef="end" />
              </bpmn:process>
              <bpmndi:BPMNDiagram>
                <bpmndi:BPMNPlane>
                  <bpmndi:BPMNShape id="task_di" bpmnElement="task">
                    <dc:Bounds x="240" y="120" width="180" height="80" />
                  </bpmndi:BPMNShape>
                </bpmndi:BPMNPlane>
              </bpmndi:BPMNDiagram>
            </bpmn:definitions>"#,
        )
        .expect("standard BPMN should import");

        let model: BpmnModel = serde_json::from_str(&imported).expect("import result is JSON");
        assert_eq!(model.nodes.len(), 3);
        assert_eq!(model.flows.len(), 2);
        assert_eq!(model.nodes[1].node_type, BpmnNodeType::Task);
        assert_eq!(model.nodes[1].name.as_deref(), Some("Review"));
        assert_eq!(model.nodes[1].x, Some(240.0));
        assert_eq!(model.nodes[1].height, Some(80.0));
    }
}
