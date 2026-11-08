// Diagrams for the chat unit tests (not part of the app bundle).

import { BpmnModdle } from 'bpmn-moddle';

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
  'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';

const shape = (id, x, y, w, h) => `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}" /></bpmndi:BPMNShape>`;
const edge = (id, points) => `<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${points.map(([x, y]) => `<di:waypoint x="${x}" y="${y}" />`).join('')}</bpmndi:BPMNEdge>`;

/** Start → "Pack order" → "Ship order" → end, in one process. `extra` adds process content. */
export function orderProcess({ packName = 'Pack order', extra = '', extraDi = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Defs" targetNamespace="http://example.com/bpmn">
  <bpmn:process id="Process_1" name="Orders" isExecutable="false">
    <bpmn:startEvent id="Start" name="Order received"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Pack" name="${packName}"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:documentation>Put items in a box</bpmn:documentation></bpmn:task>
    <bpmn:task id="Ship" name="Ship order"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End" name="Order shipped"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Pack" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Pack" targetRef="Ship" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Ship" targetRef="End" />
    ${extra}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      ${shape('Start', 152, 102, 36, 36)}${shape('Pack', 240, 80, 100, 80)}${shape('Ship', 400, 80, 100, 80)}${shape('End', 562, 102, 36, 36)}
      ${edge('Flow_1', [[188, 120], [240, 120]])}${edge('Flow_2', [[340, 120], [400, 120]])}${edge('Flow_3', [[500, 120], [562, 120]])}
      ${extraDi}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

/** A pool with two lanes. */
export const POOL = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Defs" targetNamespace="http://example.com/bpmn">
  <bpmn:collaboration id="Collab"><bpmn:participant id="Shop" name="Shop" processRef="Process_1" /></bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Sales" name="Sales"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Warehouse" name="Warehouse"><bpmn:flowNodeRef>Pick</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start" />
    <bpmn:userTask id="Pick" name="Pick items" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collab">
      ${shape('Shop', 100, 50, 600, 250)}${shape('Sales', 130, 50, 570, 125)}${shape('Warehouse', 130, 175, 570, 125)}
      ${shape('Start', 180, 95, 36, 36)}${shape('Pick', 260, 200, 100, 80)}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export const moddle = () => new BpmnModdle();

export async function parse(xml) {
  return (await moddle().fromXML(xml, 'bpmn:Definitions')).rootElement;
}
