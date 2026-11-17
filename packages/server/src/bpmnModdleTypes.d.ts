// The main entry of bpmn-moddle has no types (only the generated element types under `bpmn-moddle/types`, which
// do not describe the moddle API). This declares just what bpmnModel.ts uses.
declare module 'bpmn-moddle' {
  export class BpmnModdle {
    fromXML(xml: string, typeName?: string): Promise<{ rootElement: unknown; warnings: { message: string }[] }>;
  }
}
