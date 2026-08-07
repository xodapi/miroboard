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

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BpmnModel {
    nodes: Vec<BpmnNode>,
    flows: Vec<BpmnFlow>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BpmnNode {
    id: String,
    #[serde(rename = "type")]
    node_type: BpmnNodeType,
    #[serde(default)]
    pool_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BpmnFlow {
    id: String,
    source_id: String,
    target_id: String,
    #[serde(default)]
    flow_type: BpmnFlowType,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
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

#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Default)]
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
                },
                BpmnNode {
                    id: "task".into(),
                    node_type: BpmnNodeType::Task,
                    pool_id: Some("pool-a".into()),
                },
                BpmnNode {
                    id: "end".into(),
                    node_type: BpmnNodeType::EndEvent,
                    pool_id: Some("pool-a".into()),
                },
            ],
            flows: vec![
                BpmnFlow {
                    id: "flow-1".into(),
                    source_id: "start".into(),
                    target_id: "task".into(),
                    flow_type: BpmnFlowType::Sequence,
                },
                BpmnFlow {
                    id: "flow-2".into(),
                    source_id: "task".into(),
                    target_id: "end".into(),
                    flow_type: BpmnFlowType::Sequence,
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
}
