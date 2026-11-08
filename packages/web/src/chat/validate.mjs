// Checks BPMN XML from the assistant before it replaces the diagram (bpmn_replace_xml): it must
// parse cleanly with the editor's moddle, contain a process or collaboration, and have no
// unknown elements, duplicate ids or broken references (moddle reports those as warnings).

export const MAX_XML_BYTES = 5 * 1024 * 1024;

/** { ok: true, definitions, hasLayout } or { ok: false, error }. */
export async function validateBpmnXml(moddle, xml) {
  if (typeof xml !== 'string' || !xml.trim()) return { ok: false, error: 'xml is empty' };
  if (new TextEncoder().encode(xml).length > MAX_XML_BYTES) return { ok: false, error: 'xml is larger than 5 MB' };
  if (!/<([\w-]+:)?definitions[\s>]/.test(xml)) return { ok: false, error: 'Not BPMN: there is no definitions element' };
  let result;
  try {
    result = await moddle.fromXML(xml, 'bpmn:Definitions');
  } catch (err) {
    return { ok: false, error: `The XML could not be read: ${err.message}` };
  }
  const { rootElement: definitions, warnings = [] } = result;
  if (warnings.length) {
    const shown = warnings.slice(0, 5).map((w) => w.message).join('; ');
    return { ok: false, error: `The XML has ${warnings.length} problem(s): ${shown}` };
  }
  const roots = definitions.rootElements || [];
  if (!roots.some((r) => r.$type === 'bpmn:Process' || r.$type === 'bpmn:Collaboration')) {
    return { ok: false, error: 'The XML contains no process or collaboration' };
  }
  const hasLayout = (definitions.diagrams || []).some((d) => d.plane?.planeElement?.length);
  return { ok: true, definitions, hasLayout };
}
