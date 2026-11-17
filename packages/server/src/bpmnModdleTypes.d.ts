// bpmn-moddle ships no types; only what bpmnModel.ts uses.
declare module 'bpmn-moddle' {
  export class BpmnModdle {
    fromXML(xml: string, typeName?: string): Promise<{ rootElement: unknown; warnings: { message: string }[] }>;
  }
}
