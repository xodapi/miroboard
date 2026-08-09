use quick_xml::{events::Event, Reader};
use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

const MAX_BPMN_NODES: usize = 10_000;
const MAX_BPMN_FLOWS: usize = 20_000;
const MAX_DURATION_MS: u64 = 86_400_000 * 30;
const MAX_RESOURCE_CAPACITY: u32 = 1_000;
const MAX_ARRIVAL_INTERVAL_MS: u64 = 86_400_000 * 30;
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
    #[serde(default)]
    sla_target_ms: Option<u64>,
    #[serde(default)]
    calendar_work_start_ms: Option<u64>,
    #[serde(default)]
    calendar_work_end_ms: Option<u64>,
    #[serde(default = "default_simulation_instances")]
    simulation_instances: u32,
    #[serde(default)]
    arrival_interval_ms: u64,
    #[serde(default)]
    arrival_classes: Vec<ArrivalClass>,
    #[serde(default)]
    resource_roles: Vec<ResourceRole>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ArrivalClass {
    count: u32,
    interval_ms: u64,
    priority: i32,
}

fn default_simulation_instances() -> u32 { 1 }

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
    priority: Option<i32>,
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
enum QueuePolicy {
    #[default]
    Fifo,
    Priority,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ResourceRole {
    name: String,
    capacity: u32,
    #[serde(default)]
    queue_policy: QueuePolicy,
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
    if model.nodes.len() > MAX_BPMN_NODES {
        result.error("model-too-large", "BPMN model contains too many nodes.", None);
    }
    if model.flows.len() > MAX_BPMN_FLOWS {
        result.error("model-too-large", "BPMN model contains too many flows.", None);
    }
    if model.arrival_interval_ms > MAX_ARRIVAL_INTERVAL_MS {
        result.error("arrival-interval-invalid", "Arrival interval is too large.", None);
    }
    let class_instances = model.arrival_classes.iter().map(|class| class.count as u64).sum::<u64>();
    if class_instances > 1_000 || model.arrival_classes.iter().any(|class| class.count == 0 || class.interval_ms > MAX_ARRIVAL_INTERVAL_MS) {
        result.error("arrival-classes-invalid", "Arrival classes must have 1..1000 total instances and bounded intervals.", None);
    }
    match (model.calendar_work_start_ms, model.calendar_work_end_ms) {
        (Some(start), Some(end)) if start < end && end <= 86_400_000 => {}
        (Some(_), Some(_)) => result.error(
            "calendar-range-invalid",
            "Calendar work window must satisfy 0 <= start < end <= 24 hours.",
            None,
        ),
        (Some(_), None) | (None, Some(_)) => result.error(
            "calendar-range-incomplete",
            "Calendar work start and end must be provided together.",
            None,
        ),
        (None, None) => {}
    }
    let mut nodes_by_id = HashMap::new();
    if model.simulation_instances == 0 || model.simulation_instances > 1_000 {
        result.error(
            "simulation-instances-invalid",
            "Simulation instances must be between 1 and 1000.",
            None,
        );
    }
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
        if node.resource_capacity.is_some_and(|capacity| capacity == 0 || capacity > MAX_RESOURCE_CAPACITY) {
            result.error("resource-capacity-invalid", "Resource capacity must be between 1 and 1000.", Some(&node.id));
        }
        if node.duration_ms.is_some_and(|duration| duration > MAX_DURATION_MS)
            || node.duration_min_ms.is_some_and(|duration| duration > MAX_DURATION_MS)
            || node.duration_mode_ms.is_some_and(|duration| duration > MAX_DURATION_MS)
            || node.duration_max_ms.is_some_and(|duration| duration > MAX_DURATION_MS)
        {
            result.error("duration-too-large", "Task duration must not exceed 30 days.", Some(&node.id));
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

        if node.node_type == BpmnNodeType::OrGateway {
            result.error(
                "or-gateway-unsupported",
                "Inclusive gateways are not supported by the deterministic runner. Use an XOR or AND gateway.",
                Some(&node.id),
            );
        }

        if !matches!(
            node.node_type,
            BpmnNodeType::XorGateway | BpmnNodeType::AndGateway | BpmnNodeType::OrGateway | BpmnNodeType::EndEvent
        ) && outbound > 1
        {
            result.error(
                "implicit-split-unsupported",
                "Only XOR and AND gateways may have multiple outgoing sequence flows.",
                Some(&node.id),
            );
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
    role_workload_ms: BTreeMap<String, u64>,
    role_capacity: BTreeMap<String, u32>,
    role_waiting_ms: BTreeMap<String, u64>,
}

fn fixed_duration_ms(node: &BpmnNode) -> u64 {
    node.duration_ms.unwrap_or(match node.node_type {
        BpmnNodeType::Task | BpmnNodeType::ServiceTask | BpmnNodeType::UserTask => 1_000,
        _ => 0,
    })
}

fn calendar_enabled(model: &BpmnModel) -> bool {
    model.calendar_work_start_ms.is_some() && model.calendar_work_end_ms.is_some()
}

fn calendar_start(model: &BpmnModel, timestamp_ms: u64) -> u64 {
    let (Some(work_start), Some(work_end)) = (model.calendar_work_start_ms, model.calendar_work_end_ms) else {
        return timestamp_ms;
    };
    if work_end <= work_start || work_end > 86_400_000 {
        return timestamp_ms;
    }
    let day = timestamp_ms / 86_400_000;
    let offset = timestamp_ms % 86_400_000;
    if offset < work_start {
        day * 86_400_000 + work_start
    } else if offset >= work_end {
        (day + 1) * 86_400_000 + work_start
    } else {
        timestamp_ms
    }
}

fn calendar_add(model: &BpmnModel, start_ms: u64, duration_ms: u64) -> u64 {
    if !calendar_enabled(model) {
        return start_ms.saturating_add(duration_ms);
    }
    let (work_start, work_end) = (model.calendar_work_start_ms.unwrap(), model.calendar_work_end_ms.unwrap());
    if work_end <= work_start || work_end > 86_400_000 {
        return start_ms.saturating_add(duration_ms);
    }
    let mut cursor = calendar_start(model, start_ms);
    let mut remaining = duration_ms;
    while remaining > 0 {
        let offset = cursor % 86_400_000;
        let available = work_end.saturating_sub(offset);
        if remaining <= available {
            return cursor.saturating_add(remaining);
        }
        remaining = remaining.saturating_sub(available);
        cursor = (cursor / 86_400_000 + 1) * 86_400_000 + work_start;
    }
    cursor
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

#[derive(Debug, Clone)]
struct ActiveToken<'a> {
    node_id: &'a str,
    arrived_at: u64,
    priority: i32,
    instance_index: u32,
    sequence: u64,
}

#[derive(Debug, Clone, Copy)]
struct InstanceSpec {
    index: u32,
    arrival_at_ms: u64,
    priority: i32,
}

#[derive(Debug, Clone)]
struct InstanceOutcome {
    priority: i32,
    duration_ms: u64,
    cost: f64,
    waiting_ms: u64,
}

struct BpmnBatchResult {
    completed: bool,
    token_path: Vec<String>,
    instances: Vec<InstanceOutcome>,
    role_workload_ms: BTreeMap<String, u64>,
    role_capacity: BTreeMap<String, u32>,
    role_waiting_ms: BTreeMap<String, u64>,
}

/// Executes one or more BPMN process instances inside a single scheduling
/// context. All instances share the resource slots, so tokens from different
/// instances compete in the same queue and a role's queue policy can reorder
/// them. Supplying a random state enables seeded probability selection for XOR
/// gateways.
fn run_bpmn_batch(
    model: &BpmnModel,
    random_state: &mut Option<u64>,
    specs: &[InstanceSpec],
) -> Result<BpmnBatchResult, JsValue> {
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
    let role_registry: HashMap<&str, &ResourceRole> = model
        .resource_roles
        .iter()
        .map(|role| (role.name.as_str(), role))
        .collect();

    let mut sequence = 0u64;
    let mut active_tokens: Vec<ActiveToken> = specs
        .iter()
        .map(|spec| {
            let token = ActiveToken {
                node_id: start.id.as_str(),
                arrived_at: spec.arrival_at_ms,
                priority: spec.priority,
                instance_index: spec.index,
                sequence,
            };
            sequence += 1;
            token
        })
        .collect();

    let mut resource_slots: HashMap<String, Vec<u64>> = HashMap::new();
    let mut waiting_at_parallel_join: HashMap<(u32, &str), (usize, u64)> = HashMap::new();
    let mut token_path = Vec::new();
    let mut completed_tokens = 0usize;
    let mut role_workload_ms: BTreeMap<String, u64> = BTreeMap::new();
    let mut role_capacity: BTreeMap<String, u32> = BTreeMap::new();
    let mut role_waiting_ms: BTreeMap<String, u64> = BTreeMap::new();
    let mut instance_end_ms: HashMap<u32, u64> = HashMap::new();
    let mut instance_cost: HashMap<u32, f64> = HashMap::new();
    let mut instance_waiting_ms: HashMap<u32, u64> = HashMap::new();
    let step_limit = model
        .nodes
        .len()
        .saturating_mul(model.flows.len().max(1))
        .saturating_mul(4)
        .saturating_mul(specs.len().max(1));

    for _ in 0..=step_limit {
        if active_tokens.is_empty() {
            if waiting_at_parallel_join.is_empty() && completed_tokens > 0 {
                let instances = specs
                    .iter()
                    .map(|spec| InstanceOutcome {
                        priority: spec.priority,
                        duration_ms: instance_end_ms
                            .get(&spec.index)
                            .copied()
                            .unwrap_or(spec.arrival_at_ms)
                            .saturating_sub(spec.arrival_at_ms),
                        cost: instance_cost.get(&spec.index).copied().unwrap_or(0.0),
                        waiting_ms: instance_waiting_ms.get(&spec.index).copied().unwrap_or(0),
                    })
                    .collect();
                return Ok(BpmnBatchResult {
                    completed: true,
                    token_path,
                    instances,
                    role_workload_ms,
                    role_capacity,
                    role_waiting_ms,
                });
            }
            return Err(JsValue::from_str(
                "A parallel gateway is waiting for tokens from unfinished branches.",
            ));
        }

        // Tokens on nodes without a resource role never contend for capacity, so they
        // advance first. That drains every instance up to the resource queues before a
        // single capacity decision is made, which is what lets a queue policy compare
        // tokens that belong to different instances.
        let mut next_index = 0usize;
        let mut best_key: Option<(u8, u64, Reverse<i32>, u64, u32, u64)> = None;
        for (index, token) in active_tokens.iter().enumerate() {
            let node = nodes_by_id.get(token.node_id);
            let resource_role = node
                .and_then(|node| node.resource_role.as_deref())
                .filter(|role| !role.trim().is_empty());
            let (phase, earliest_exec_ms, priority_key) = match resource_role {
                Some(role_name) => {
                    let earliest_slot = resource_slots
                        .get(role_name)
                        .and_then(|slots| slots.iter().min().copied())
                        .unwrap_or(0);
                    let policy = role_registry
                        .get(role_name)
                        .map(|role| &role.queue_policy)
                        .unwrap_or(&QueuePolicy::Fifo);
                    let priority_key = match policy {
                        QueuePolicy::Priority => Reverse(token.priority),
                        QueuePolicy::Fifo => Reverse(0),
                    };
                    (1u8, token.arrived_at.max(earliest_slot), priority_key)
                }
                None => (0u8, token.arrived_at, Reverse(0)),
            };
            let key = (
                phase,
                earliest_exec_ms,
                priority_key,
                token.arrived_at,
                token.instance_index,
                token.sequence,
            );
            if best_key.is_none_or(|best| key < best) {
                best_key = Some(key);
                next_index = index;
            }
        }

        let token = active_tokens.remove(next_index);
        let current_id = token.node_id;
        let arrived_at_ms = token.arrived_at;
        token_path.push(current_id.to_owned());
        let current = nodes_by_id
            .get(current_id)
            .ok_or_else(|| JsValue::from_str("Token reached a missing BPMN node."))?;
        let sampled_duration_ms = sampled_duration_ms(current, random_state);
        let mut task_start_ms = calendar_start(model, arrived_at_ms);
        if let Some(role_name) = current
            .resource_role
            .as_deref()
            .filter(|role| !role.trim().is_empty())
        {
            let capacity = role_registry
                .get(role_name)
                .map(|role| role.capacity.max(1) as usize)
                .or_else(|| current.resource_capacity.map(|cap| cap.max(1) as usize))
                .unwrap_or(1);
            let slots = resource_slots
                .entry(role_name.to_owned())
                .or_insert_with(|| vec![0; capacity]);
            let slot_index = slots
                .iter()
                .enumerate()
                .min_by_key(|(_, finish)| *finish)
                .map(|(index, _)| index)
                .unwrap_or(0);
            task_start_ms = calendar_start(model, task_start_ms.max(slots[slot_index]));
            let waited_ms = task_start_ms.saturating_sub(arrived_at_ms);
            *role_waiting_ms.entry(role_name.to_owned()).or_default() += waited_ms;
            *instance_waiting_ms.entry(token.instance_index).or_default() += waited_ms;
            slots[slot_index] = calendar_add(model, task_start_ms, sampled_duration_ms);
        }
        let completed_at_ms = calendar_add(model, task_start_ms, sampled_duration_ms);
        *instance_cost.entry(token.instance_index).or_insert(0.0) +=
            sampled_duration_ms as f64 / 3_600_000.0 * current.cost_per_hour.unwrap_or(0.0);
        if let Some(role_name) = current
            .resource_role
            .as_deref()
            .filter(|role| !role.trim().is_empty())
        {
            *role_workload_ms.entry(role_name.to_owned()).or_default() += sampled_duration_ms;
            let tracked_capacity = role_registry
                .get(role_name)
                .map(|role| role.capacity.max(1))
                .or_else(|| current.resource_capacity.map(|cap| cap.max(1)))
                .unwrap_or(1);
            role_capacity
                .entry(role_name.to_owned())
                .and_modify(|capacity| *capacity = (*capacity).min(tracked_capacity))
                .or_insert(tracked_capacity);
        }
        if current.node_type == BpmnNodeType::EndEvent {
            completed_tokens += 1;
            let instance_end = instance_end_ms.entry(token.instance_index).or_insert(0);
            *instance_end = (*instance_end).max(completed_at_ms);
            continue;
        }
        let flows = outgoing.get(current_id).ok_or_else(|| {
            JsValue::from_str("The token reached a node without an outgoing sequence flow.")
        })?;
        if current.node_type == BpmnNodeType::AndGateway
            && incoming.get(current_id).map_or(0, Vec::len) > 1
        {
            let required = incoming.get(current_id).map_or(0, Vec::len);
            let waiting = waiting_at_parallel_join
                .entry((token.instance_index, current_id))
                .or_default();
            waiting.0 += 1;
            waiting.1 = waiting.1.max(completed_at_ms);
            if waiting.0 < required {
                continue;
            }
            let synchronized_at_ms = waiting.1;
            waiting_at_parallel_join.remove(&(token.instance_index, current_id));
            if flows.len() > 1 {
                for flow in flows {
                    active_tokens.push(ActiveToken {
                        node_id: flow.target_id.as_str(),
                        arrived_at: synchronized_at_ms,
                        priority: token.priority,
                        instance_index: token.instance_index,
                        sequence,
                    });
                    sequence += 1;
                }
            } else {
                active_tokens.push(ActiveToken {
                    node_id: select_flow(current, flows, random_state).target_id.as_str(),
                    arrived_at: synchronized_at_ms,
                    priority: token.priority,
                    instance_index: token.instance_index,
                    sequence,
                });
                sequence += 1;
            }
            continue;
        }

        if current.node_type == BpmnNodeType::AndGateway && flows.len() > 1 {
            for flow in flows {
                active_tokens.push(ActiveToken {
                    node_id: flow.target_id.as_str(),
                    arrived_at: completed_at_ms,
                    priority: token.priority,
                    instance_index: token.instance_index,
                    sequence,
                });
                sequence += 1;
            }
        } else {
            active_tokens.push(ActiveToken {
                node_id: select_flow(current, flows, random_state).target_id.as_str(),
                arrived_at: completed_at_ms,
                priority: token.priority,
                instance_index: token.instance_index,
                sequence,
            });
            sequence += 1;
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
    let batch = run_bpmn_batch(
        &model,
        &mut None,
        &[InstanceSpec {
            index: 0,
            arrival_at_ms: 0,
            priority: 0,
        }],
    )?;
    let instance = batch.instances.first();
    let result = BpmnRunResult {
        completed: batch.completed,
        token_path: batch.token_path,
        estimated_duration_ms: instance.map_or(0, |instance| instance.duration_ms),
        estimated_cost: instance.map_or(0.0, |instance| instance.cost),
        role_workload_ms: batch.role_workload_ms,
        role_capacity: batch.role_capacity,
        role_waiting_ms: batch.role_waiting_ms,
    };
    serde_json::to_string(&result)
        .map_err(|error| JsValue::from_str(&format!("Could not serialize BPMN run: {error}")))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BpmnSimulationResult {
    seed: u64,
    runs: u32,
    completed_runs: u32,
    simulation_instances: u32,
    arrival_interval_ms: u64,
    min_duration_ms: u64,
    mean_duration_ms: u64,
    standard_deviation_ms: u64,
    p50_duration_ms: u64,
    p90_duration_ms: u64,
    p95_duration_ms: u64,
    max_duration_ms: u64,
    mean_cost: f64,
    role_utilization: Vec<BpmnRoleUtilization>,
    priority_classes: Vec<BpmnPriorityClassStats>,
    sla_target_ms: Option<u64>,
    on_time_rate: Option<f64>,
}

/// Per-priority-class aggregates. Aggregate means hide the effect of a priority
/// queue because the total amount of waiting is conserved; splitting the same
/// waiting by class is what makes FIFO and priority visibly different.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BpmnPriorityClassStats {
    priority: i32,
    instances: u32,
    mean_waiting_ms: u64,
    mean_duration_ms: u64,
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
    if values.is_empty() {
        return 0;
    }
    if values.len() == 1 {
        return values[0];
    }
    // Linear interpolation between the two nearest ranks
    let rank = percentile * (values.len() - 1) as f64;
    let lower_index = rank.floor() as usize;
    let upper_index = rank.ceil() as usize;
    if lower_index == upper_index {
        return values[lower_index];
    }
    let lower_value = values[lower_index] as f64;
    let upper_value = values[upper_index] as f64;
    let fraction = rank - lower_index as f64;
    // A tiny epsilon makes whole-millisecond rounding stable around binary
    // floating-point representations such as 0.95 * 3.
    (lower_value + fraction * (upper_value - lower_value) + 1e-9).round() as u64
}

fn sample_variance(values: &[u64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let mean = values.iter().map(|value| *value as f64).sum::<f64>() / values.len() as f64;
    values
        .iter()
        .map(|value| (*value as f64 - mean).powi(2))
        .sum::<f64>()
        / (values.len() - 1) as f64
}

fn simulation_run_seed(seed: u64, run_index: u64) -> u64 {
    // SplitMix64 keeps each deterministic Monte Carlo run independent from the
    // amount of randomness consumed by earlier runs.
    let mut value = seed.wrapping_add(run_index.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    value = (value ^ (value >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    value ^ (value >> 31)
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
    let mut durations = Vec::with_capacity(runs as usize);
    let mut costs = Vec::with_capacity(runs as usize);
    let mut role_workloads: BTreeMap<String, u128> = BTreeMap::new();
    let mut role_capacities: BTreeMap<String, u32> = BTreeMap::new();
    let mut role_waiting: BTreeMap<String, u128> = BTreeMap::new();
    
    // Build the instance schedule from arrival classes, or fall back to the legacy
    // single-class mode driven by `simulationInstances` / `arrivalIntervalMs`.
    let specs: Vec<InstanceSpec> = if model.arrival_classes.is_empty() {
        (0..model.simulation_instances)
            .map(|index| InstanceSpec {
                index,
                arrival_at_ms: index as u64 * model.arrival_interval_ms,
                priority: 0,
            })
            .collect()
    } else {
        let mut schedule = Vec::new();
        let mut index = 0u32;
        let mut cumulative_time_ms = 0u64;
        for class in &model.arrival_classes {
            for _ in 0..class.count {
                schedule.push(InstanceSpec {
                    index,
                    arrival_at_ms: cumulative_time_ms,
                    priority: class.priority,
                });
                index += 1;
                cumulative_time_ms = cumulative_time_ms.saturating_add(class.interval_ms);
            }
        }
        schedule
    };

    // (waiting_ms, duration_ms, instances) keyed by priority.
    let mut priority_stats: BTreeMap<i32, (u128, u128, u32)> = BTreeMap::new();

    for run_index in 0..runs {
        let mut random_state = Some(simulation_run_seed(seed, run_index as u64));
        let batch = run_bpmn_batch(&model, &mut random_state, &specs)?;
        let batch_instance_count = batch.instances.len().max(1) as u128;
        let batch_duration_ms = batch
            .instances
            .iter()
            .map(|instance| instance.duration_ms as u128)
            .sum::<u128>()
            / batch_instance_count;
        let batch_cost = batch.instances.iter().map(|instance| instance.cost).sum::<f64>()
            / batch_instance_count as f64;
        // One sample per Monte Carlo run. Instances in the same batch share
        // resource slots and therefore are not independent observations.
        durations.push(batch_duration_ms as u64);
        costs.push(batch_cost);
        for instance in &batch.instances {
            let entry = priority_stats.entry(instance.priority).or_default();
            entry.0 += instance.waiting_ms as u128;
            entry.1 += instance.duration_ms as u128;
            entry.2 += 1;
        }
        for (role, workload) in batch.role_workload_ms {
            *role_workloads.entry(role).or_default() += workload as u128;
        }
        for (role, capacity) in batch.role_capacity {
            role_capacities
                .entry(role)
                .and_modify(|current| *current = (*current).min(capacity))
                .or_insert(capacity);
        }
        for (role, waiting) in batch.role_waiting_ms {
            *role_waiting.entry(role).or_default() += waiting as u128;
        }
    }
    let mut priority_classes: Vec<BpmnPriorityClassStats> = priority_stats
        .into_iter()
        .map(|(priority, (waiting, duration, instances))| BpmnPriorityClassStats {
            priority,
            instances,
            mean_waiting_ms: (waiting / instances.max(1) as u128) as u64,
            mean_duration_ms: (duration / instances.max(1) as u128) as u64,
        })
        .collect();
    priority_classes.sort_by_key(|entry| std::cmp::Reverse(entry.priority));
    durations.sort_unstable();
    let total_duration: u128 = durations.iter().map(|duration| *duration as u128).sum();
    let mean_duration_ms = (total_duration / durations.len() as u128) as u64;
    let variance = sample_variance(&durations);
    let on_time_rate = model.sla_target_ms.map(|target| {
        durations.iter().filter(|duration| **duration <= target).count() as f64 / durations.len() as f64
    });
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
        simulation_instances: specs.len() as u32,
        arrival_interval_ms: model.arrival_interval_ms,
        min_duration_ms: durations[0],
        mean_duration_ms,
        standard_deviation_ms: variance.sqrt().round() as u64,
        p50_duration_ms: percentile(&durations, 0.50),
        p90_duration_ms: percentile(&durations, 0.90),
        p95_duration_ms: percentile(&durations, 0.95),
        max_duration_ms: *durations.last().expect("simulation has at least one run"),
        mean_cost: costs.iter().sum::<f64>() / costs.len() as f64,
        role_utilization,
        priority_classes,
        sla_target_ms: model.sla_target_ms,
        on_time_rate,
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

fn miro_node_attributes(node: &BpmnNode) -> String {
    let mut attributes = format!(
        r#" miro:durationDistribution="{}""#,
        match node.duration_distribution {
            BpmnDurationDistribution::Fixed => "fixed",
            BpmnDurationDistribution::Uniform => "uniform",
            BpmnDurationDistribution::Triangular => "triangular",
        }
    );
    if let Some(value) = node.duration_ms {
        attributes.push_str(&format!(r#" miro:durationMs="{value}""#));
    }
    if let Some(value) = node.duration_min_ms {
        attributes.push_str(&format!(r#" miro:durationMinMs="{value}""#));
    }
    if let Some(value) = node.duration_mode_ms {
        attributes.push_str(&format!(r#" miro:durationModeMs="{value}""#));
    }
    if let Some(value) = node.duration_max_ms {
        attributes.push_str(&format!(r#" miro:durationMaxMs="{value}""#));
    }
    if let Some(value) = node.resource_role.as_deref() {
        attributes.push_str(&format!(r#" miro:resourceRole="{}""#, escape_xml(value)));
    }
    if let Some(value) = node.cost_per_hour {
        attributes.push_str(&format!(r#" miro:costPerHour="{value}""#));
    }
    if let Some(value) = node.resource_capacity {
        attributes.push_str(&format!(r#" miro:resourceCapacity="{value}""#));
    }
    if let Some(value) = node.priority {
        attributes.push_str(&format!(r#" miro:priority="{value}""#));
    }
    attributes
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
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:miro="https://miroboard.app/bpmn/extensions"
                  id="MiroBoard_Definitions"
                  targetNamespace="https://miroboard.app/bpmn">
  <bpmn:process id="MiroBoard_Process" isExecutable="false">
"#,
    );
    let default_flow_by_source: HashMap<&str, &str> = model
        .flows
        .iter()
        .filter(|flow| flow.is_default)
        .map(|flow| (flow.source_id.as_str(), flow.id.as_str()))
        .collect();
    for node in &model.nodes {
        let name = node
            .name
            .as_deref()
            .filter(|name| !name.trim().is_empty())
            .map(|name| format!(r#" name="{}""#, escape_xml(name)))
            .unwrap_or_default();
        let miro_attributes = miro_node_attributes(node);
        let default_flow = default_flow_by_source
            .get(node.id.as_str())
            .map(|flow_id| format!(r#" default="{}""#, escape_xml(flow_id)))
            .unwrap_or_default();
        xml.push_str(&format!(
            r#"    <{} id="{}"{}{}{} />
"#,
            bpmn_tag(&node.node_type),
            escape_xml(&node.id),
            name,
            miro_attributes,
            default_flow,
        ));
    }
    for flow in &model.flows {
        let tag = match flow.flow_type {
            BpmnFlowType::Sequence => "bpmn:sequenceFlow",
            BpmnFlowType::Message => "bpmn:messageFlow",
        };
        let probability = flow
            .probability
            .map(|value| format!(r#" miro:probability="{}""#, value))
            .unwrap_or_default();
        if let Some(condition) = flow.condition.as_deref().filter(|condition| !condition.trim().is_empty()) {
            xml.push_str(&format!(
                r#"    <{} id="{}" sourceRef="{}" targetRef="{}"{}><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">{}</bpmn:conditionExpression></{}>
"#,
                tag,
                escape_xml(&flow.id),
                escape_xml(&flow.source_id),
                escape_xml(&flow.target_id),
                probability,
                escape_xml(condition),
                tag,
            ));
        } else {
            xml.push_str(&format!(
                r#"    <{} id="{}" sourceRef="{}" targetRef="{}"{} />
"#,
                tag,
                escape_xml(&flow.id),
                escape_xml(&flow.source_id),
                escape_xml(&flow.target_id),
                probability,
            ));
        }
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
    let mut node_index_by_id: HashMap<String, usize> = HashMap::new();
    let mut flow_index_by_id: HashMap<String, usize> = HashMap::new();
    let mut default_flow_by_source: HashMap<String, String> = HashMap::new();
    let mut buffer = Vec::new();
    let mut active_shape_element: Option<String> = None;
    let mut active_condition_flow: Option<String> = None;
    let mut condition_text = String::new();

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
                let mut default_flow = None;
                let mut probability = None;
                let mut x = None;
                let mut y = None;
                let mut width = None;
                let mut height = None;
                let mut duration_ms = None;
                let mut duration_distribution = BpmnDurationDistribution::Fixed;
                let mut duration_min_ms = None;
                let mut duration_mode_ms = None;
                let mut duration_max_ms = None;
                let mut resource_role = None;
                let mut cost_per_hour = None;
                let mut resource_capacity = None;
                let mut priority = None;
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
                        "default" => default_flow = Some(value),
                        "probability" => probability = value.parse::<f64>().ok(),
                        "x" => x = value.parse::<f64>().ok(),
                        "y" => y = value.parse::<f64>().ok(),
                        "width" => width = value.parse::<f64>().ok(),
                        "height" => height = value.parse::<f64>().ok(),
                        "durationMs" => duration_ms = value.parse::<u64>().ok(),
                        "durationDistribution" => {
                            duration_distribution = match value.as_str() {
                                "uniform" => BpmnDurationDistribution::Uniform,
                                "triangular" => BpmnDurationDistribution::Triangular,
                                _ => BpmnDurationDistribution::Fixed,
                            };
                        }
                        "durationMinMs" => duration_min_ms = value.parse::<u64>().ok(),
                        "durationModeMs" => duration_mode_ms = value.parse::<u64>().ok(),
                        "durationMaxMs" => duration_max_ms = value.parse::<u64>().ok(),
                        "resourceRole" => resource_role = Some(value),
                        "costPerHour" => cost_per_hour = value.parse::<f64>().ok(),
                        "resourceCapacity" => resource_capacity = value.parse::<u32>().ok(),
                        "priority" => priority = value.parse::<i32>().ok(),
                        _ => {}
                    }
                }

                if tag == "BPMNShape" {
                    active_shape_element = bpmn_element;
                } else if tag == "Bounds" {
                    if let (Some(element_id), Some(x), Some(y), Some(width), Some(height)) =
                        (active_shape_element.as_deref(), x, y, width, height)
                    {
                        if let Some(&node_index) = node_index_by_id.get(element_id) {
                            let node = &mut nodes[node_index];
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
                    let node_index = nodes.len();
                    node_index_by_id.insert(id.clone(), node_index);
                    if let Some(default_flow) = default_flow {
                        default_flow_by_source.insert(id.clone(), default_flow);
                    }
                    nodes.push(BpmnNode {
                        id,
                        node_type,
                        pool_id: None,
                        name,
                        duration_ms,
                        duration_distribution,
                        duration_min_ms,
                        duration_mode_ms,
                        duration_max_ms,
                        resource_role,
                        cost_per_hour,
                        resource_capacity,
                        priority,
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
                    let flow_index = flows.len();
                    flow_index_by_id.insert(id.clone(), flow_index);
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
                        probability,
                        is_default: false,
                    });
                } else if tag == "conditionExpression" {
                    active_condition_flow = bpmn_element.or_else(|| {
                        flows.last().map(|flow| flow.id.clone())
                    });
                    condition_text.clear();
                }
            }
            Ok(Event::Text(text)) if active_condition_flow.is_some() => {
                let decoded = text
                    .unescape()
                    .map_err(|error| JsValue::from_str(&format!("Invalid BPMN condition text: {error}")))?;
                condition_text.push_str(&decoded);
            }
            Ok(Event::End(element)) => {
                let element_name = element.name();
                let tag = local_xml_name(element_name.as_ref())?;
                if tag == "BPMNShape" {
                    active_shape_element = None;
                } else if tag == "conditionExpression" {
                    if let Some(flow_id) = active_condition_flow.take() {
                        if let Some(&flow_index) = flow_index_by_id.get(&flow_id) {
                            let condition = condition_text.trim();
                            if !condition.is_empty() {
                                flows[flow_index].condition = Some(condition.to_owned());
                            }
                        }
                    }
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

    for flow in &mut flows {
        flow.is_default = default_flow_by_source
            .get(&flow.source_id)
            .is_some_and(|default_flow_id| default_flow_id == &flow.id);
    }

    serde_json::to_string(&BpmnModel { nodes, flows, sla_target_ms: None, calendar_work_start_ms: None, calendar_work_end_ms: None, simulation_instances: 1, arrival_interval_ms: 0, arrival_classes: vec![], resource_roles: vec![] })
        .map_err(|error| JsValue::from_str(&format!("Could not serialize imported BPMN: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpolates_percentiles_and_handles_small_samples() {
        assert_eq!(percentile(&[], 0.95), 0);
        assert_eq!(percentile(&[42], 0.50), 42);
        assert_eq!(percentile(&[0, 10, 20, 30], 0.50), 15);
        assert_eq!(percentile(&[0, 10, 20, 30], 0.90), 27);
        assert_eq!(percentile(&[0, 10, 20, 30], 0.95), 29);
    }

    #[test]
    fn calculates_sample_variance_using_the_floating_point_mean() {
        assert!((sample_variance(&[1, 2, 3]) - 1.0).abs() < f64::EPSILON);
        assert!((sample_variance(&[100, 200]) - 5_000.0).abs() < f64::EPSILON);
        assert_eq!(sample_variance(&[42]), 0.0);
    }

    #[test]
    fn derives_independent_deterministic_run_seeds() {
        assert_eq!(simulation_run_seed(42, 0), simulation_run_seed(42, 0));
        assert_ne!(simulation_run_seed(42, 0), simulation_run_seed(42, 1));
    }

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
                    priority: None,
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
                    priority: None,
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
                    priority: None,
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
            sla_target_ms: None,
            calendar_work_start_ms: None,
            calendar_work_end_ms: None,
            simulation_instances: 1,
            arrival_interval_ms: 0,
            arrival_classes: vec![],
            resource_roles: vec![],
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
    fn rejects_inclusive_gateways_until_their_execution_semantics_are_supported() {
        let result = validate_bpmn(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"gateway","type":"orGateway"},
                {"id":"left","type":"endEvent"},
                {"id":"right","type":"endEvent"}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"gateway"},
                {"id":"f2","sourceId":"gateway","targetId":"left"},
                {"id":"f3","sourceId":"gateway","targetId":"right"}
              ]
            }"#,
        );

        assert!(result.contains("or-gateway-unsupported"));
        assert!(result.contains(r#""valid":false"#));
    }

    #[test]
    fn rejects_implicit_task_splits_that_would_drop_a_branch() {
        let result = validate_bpmn(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"task","type":"task"},
                {"id":"left","type":"endEvent"},
                {"id":"right","type":"endEvent"}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"task"},
                {"id":"f2","sourceId":"task","targetId":"left"},
                {"id":"f3","sourceId":"task","targetId":"right"}
              ]
            }"#,
        );

        assert!(result.contains("implicit-split-unsupported"));
        assert!(result.contains(r#""valid":false"#));
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
    fn multi_role_simulation_json_is_byte_deterministic() {
        let model = r#"{"nodes":[{"id":"start","type":"startEvent"},{"id":"a","type":"task","durationMs":1000,"resourceRole":"z-role","resourceCapacity":1},{"id":"b","type":"task","durationMs":1000,"resourceRole":"a-role","resourceCapacity":1},{"id":"end","type":"endEvent"}],"flows":[{"id":"f1","sourceId":"start","targetId":"a"},{"id":"f2","sourceId":"a","targetId":"b"},{"id":"f3","sourceId":"b","targetId":"end"}]}"#;
        let first = simulate_bpmn(model, 123, 10).expect("first simulation should run");
        let second = simulate_bpmn(model, 123, 10).expect("second simulation should run");
        assert_eq!(first, second);
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
    fn queues_multiple_process_instances_on_shared_resource_slots() {
        let model = r#"{
          "simulationInstances":2,
          "arrivalIntervalMs":0,
          "nodes":[
            {"id":"start","type":"startEvent"},
            {"id":"task","type":"task","durationMs":1000,"resourceRole":"operator","resourceCapacity":1},
            {"id":"end","type":"endEvent"}
          ],
          "flows":[
            {"id":"f1","sourceId":"start","targetId":"task"},
            {"id":"f2","sourceId":"task","targetId":"end"}
          ]
        }"#;
        let result = simulate_bpmn(model, 42, 1).expect("batch model should simulate");

        assert!(result.contains(r#""completedRuns":1"#));
        assert!(result.contains(r#""meanDurationMs":1500"#));
        assert!(result.contains(r#""meanWaitingMs":500"#));
    }

    #[test]
    fn reports_sla_on_time_rate_for_a_fixed_process() {
        let model = r#"{
          "slaTargetMs":5000,
          "nodes":[
            {"id":"start","type":"startEvent"},
            {"id":"task","type":"task","durationMs":4000},
            {"id":"end","type":"endEvent"}
          ],
          "flows":[
            {"id":"f1","sourceId":"start","targetId":"task"},
            {"id":"f2","sourceId":"task","targetId":"end"}
          ]
        }"#;

        let result = simulate_bpmn(model, 42, 10).expect("SLA model should simulate");

        assert!(result.contains(r#""slaTargetMs":5000"#));
        assert!(result.contains(r#""onTimeRate":1.0"#));
    }

    #[test]
    fn calendar_moves_work_past_end_of_day_to_next_workday() {
        let model = r#"{
          "calendarWorkStartMs":0,
          "calendarWorkEndMs":5000,
          "nodes":[
            {"id":"start","type":"startEvent"},
            {"id":"task","type":"task","durationMs":8000},
            {"id":"end","type":"endEvent"}
          ],
          "flows":[
            {"id":"f1","sourceId":"start","targetId":"task"},
            {"id":"f2","sourceId":"task","targetId":"end"}
          ]
        }"#;

        let result = simulate_bpmn(model, 42, 1).expect("calendar model should simulate");

        assert!(result.contains(r#""maxDurationMs":86403000"#));
    }

    #[test]
    fn rejects_invalid_calendar_window_before_running_wasm() {
        let result = validate_bpmn(
            r#"{
              "calendarWorkStartMs":6000,
              "calendarWorkEndMs":5000,
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"end","type":"endEvent"}
              ],
              "flows":[{"id":"f1","sourceId":"start","targetId":"end"}]
            }"#,
        );

        assert!(result.contains("calendar-range-invalid"));
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
                {"id":"task","type":"task","name":"Review & approve","durationDistribution":"triangular","durationMinMs":1000,"durationModeMs":2000,"durationMaxMs":3000,"resourceRole":"reviewer","resourceCapacity":2,"costPerHour":125.5,"priority":7,"x":100,"y":20,"width":160,"height":80},
                {"id":"end","type":"endEvent","name":"End","x":300,"y":20,"width":36,"height":36}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"task"},
                {"id":"f2","sourceId":"task","targetId":"end"}
              ]
            }"#,
        )
        .expect("valid process should export");

        assert!(xml.contains(r#"<bpmn:task id="task" name="Review &amp; approve" miro:durationDistribution="triangular""#));
        assert!(xml.contains(r#"miro:resourceRole="reviewer" miro:costPerHour="125.5" miro:resourceCapacity="2" miro:priority="7""#));
        assert!(xml.contains(r#"<bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="task" />"#));
        assert!(xml.contains(r#"<bpmndi:BPMNShape id="task_di" bpmnElement="task">"#));
        assert!(xml.contains(r#"<dc:Bounds x="100" y="20" width="160" height="80" />"#));

        let round_trip = import_bpmn_xml(&xml).expect("exported BPMN should import");
        let model: BpmnModel =
            serde_json::from_str(&round_trip).expect("round-trip result is JSON");
        assert_eq!(model.nodes[1].x, Some(100.0));
        assert_eq!(model.nodes[1].width, Some(160.0));
        assert_eq!(model.nodes[1].duration_distribution, BpmnDurationDistribution::Triangular);
        assert_eq!(model.nodes[1].duration_min_ms, Some(1000));
        assert_eq!(model.nodes[1].duration_mode_ms, Some(2000));
        assert_eq!(model.nodes[1].duration_max_ms, Some(3000));
        assert_eq!(model.nodes[1].resource_role.as_deref(), Some("reviewer"));
        assert_eq!(model.nodes[1].resource_capacity, Some(2));
        assert_eq!(model.nodes[1].cost_per_hour, Some(125.5));
        assert_eq!(model.nodes[1].priority, Some(7));
    }

    #[test]
    fn preserves_xor_flow_metadata_across_bpmn_round_trip() {
        let xml = export_bpmn_xml(
            r#"{
              "nodes":[
                {"id":"start","type":"startEvent"},
                {"id":"gateway","type":"xorGateway"},
                {"id":"approved","type":"endEvent"},
                {"id":"fallback","type":"endEvent"}
              ],
              "flows":[
                {"id":"f1","sourceId":"start","targetId":"gateway"},
                {"id":"approved-flow","sourceId":"gateway","targetId":"approved","condition":"amount > 100","probability":0.75},
                {"id":"fallback-flow","sourceId":"gateway","targetId":"fallback","isDefault":true}
              ]
            }"#,
        )
        .expect("valid XOR process should export");

        assert!(xml.contains(r#"default="fallback-flow""#));
        assert!(xml.contains(r#"miro:probability="0.75""#));
        assert!(xml.contains("amount &gt; 100"));

        let round_trip = import_bpmn_xml(&xml).expect("exported BPMN should import");
        let model: BpmnModel =
            serde_json::from_str(&round_trip).expect("round-trip result is JSON");
        let approved = model
            .flows
            .iter()
            .find(|flow| flow.id == "approved-flow")
            .expect("approved flow should be imported");
        let fallback = model
            .flows
            .iter()
            .find(|flow| flow.id == "fallback-flow")
            .expect("fallback flow should be imported");
        assert_eq!(approved.condition.as_deref(), Some("amount > 100"));
        assert_eq!(approved.probability, Some(0.75));
        assert!(fallback.is_default);
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

    /// Four instances arrive together on a single-slot role. The two urgent ones
    /// are declared last, so a policy that ignores priority must serve them last.
    fn queue_policy_model(policy: &str) -> String {
        format!(
            r#"{{
          "arrivalClasses":[
            {{"count":2,"intervalMs":0,"priority":1}},
            {{"count":2,"intervalMs":0,"priority":10}}
          ],
          "resourceRoles":[
            {{"name":"operator","capacity":1,"queuePolicy":"{policy}"}}
          ],
          "nodes":[
            {{"id":"start","type":"startEvent"}},
            {{"id":"task","type":"task","durationMs":1000,"resourceRole":"operator"}},
            {{"id":"end","type":"endEvent"}}
          ],
          "flows":[
            {{"id":"f1","sourceId":"start","targetId":"task"}},
            {{"id":"f2","sourceId":"task","targetId":"end"}}
          ]
        }}"#
        )
    }

    fn priority_class(result: &str, priority: i64) -> (u64, u64) {
        let parsed: serde_json::Value = serde_json::from_str(result).expect("valid JSON");
        let class = parsed["priorityClasses"]
            .as_array()
            .expect("priorityClasses is an array")
            .iter()
            .find(|class| class["priority"].as_i64() == Some(priority))
            .expect("priority class is reported");
        (
            class["meanWaitingMs"].as_u64().expect("mean waiting"),
            class["meanDurationMs"].as_u64().expect("mean duration"),
        )
    }

    #[test]
    fn fifo_policy_ignores_arrival_class_priority() {
        let result = simulate_bpmn(&queue_policy_model("fifo"), 42, 1)
            .expect("FIFO model should simulate");

        // Served in arrival order: waits 0, 1000, 2000, 3000.
        assert_eq!(priority_class(&result, 1), (500, 1500));
        assert_eq!(priority_class(&result, 10), (2500, 3500));
    }

    #[test]
    fn priority_policy_serves_high_priority_arrivals_first() {
        let result = simulate_bpmn(&queue_policy_model("priority"), 42, 1)
            .expect("priority model should simulate");

        // The urgent class jumps the queue, so the two waiting profiles swap.
        assert_eq!(priority_class(&result, 10), (500, 1500));
        assert_eq!(priority_class(&result, 1), (2500, 3500));
    }

    #[test]
    fn queue_policy_does_not_change_aggregate_throughput() {
        let fifo = simulate_bpmn(&queue_policy_model("fifo"), 42, 1).expect("FIFO simulates");
        let priority =
            simulate_bpmn(&queue_policy_model("priority"), 42, 1).expect("priority simulates");
        let fifo: serde_json::Value = serde_json::from_str(&fifo).expect("valid JSON");
        let priority: serde_json::Value = serde_json::from_str(&priority).expect("valid JSON");

        // Reordering a queue redistributes waiting time between classes; it never
        // creates or destroys capacity, so the totals must match.
        assert_eq!(fifo["maxDurationMs"], priority["maxDurationMs"]);
        assert_eq!(fifo["meanDurationMs"], priority["meanDurationMs"]);
        assert_eq!(
            fifo["roleUtilization"][0]["meanWaitingMs"],
            priority["roleUtilization"][0]["meanWaitingMs"]
        );
    }
}
