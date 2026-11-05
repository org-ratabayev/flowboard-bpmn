// bpmnlint 'recommended' rule set, packed for bpmn-js-bpmnlint (what bpmnlint-pack-config would generate).
// Rules come from scripts/vendor-plugins.py (LINT_RULES).

import StaticResolver from '../vendor/esm/entries/bpmnlint-static-resolver.mjs';
import rule0 from '../vendor/esm/entries/bpmnlint-rules/ad-hoc-sub-process.mjs';
import rule1 from '../vendor/esm/entries/bpmnlint-rules/conditional-flows.mjs';
import rule2 from '../vendor/esm/entries/bpmnlint-rules/end-event-required.mjs';
import rule3 from '../vendor/esm/entries/bpmnlint-rules/event-based-gateway.mjs';
import rule4 from '../vendor/esm/entries/bpmnlint-rules/event-sub-process-typed-start-event.mjs';
import rule5 from '../vendor/esm/entries/bpmnlint-rules/fake-join.mjs';
import rule6 from '../vendor/esm/entries/bpmnlint-rules/global.mjs';
import rule7 from '../vendor/esm/entries/bpmnlint-rules/label-required.mjs';
import rule8 from '../vendor/esm/entries/bpmnlint-rules/link-event.mjs';
import rule9 from '../vendor/esm/entries/bpmnlint-rules/no-bpmndi.mjs';
import rule10 from '../vendor/esm/entries/bpmnlint-rules/no-complex-gateway.mjs';
import rule11 from '../vendor/esm/entries/bpmnlint-rules/no-disconnected.mjs';
import rule12 from '../vendor/esm/entries/bpmnlint-rules/no-duplicate-sequence-flows.mjs';
import rule13 from '../vendor/esm/entries/bpmnlint-rules/no-gateway-join-fork.mjs';
import rule14 from '../vendor/esm/entries/bpmnlint-rules/no-implicit-split.mjs';
import rule15 from '../vendor/esm/entries/bpmnlint-rules/no-implicit-end.mjs';
import rule16 from '../vendor/esm/entries/bpmnlint-rules/no-implicit-start.mjs';
import rule17 from '../vendor/esm/entries/bpmnlint-rules/no-inclusive-gateway.mjs';
import rule18 from '../vendor/esm/entries/bpmnlint-rules/no-overlapping-elements.mjs';
import rule19 from '../vendor/esm/entries/bpmnlint-rules/single-blank-start-event.mjs';
import rule20 from '../vendor/esm/entries/bpmnlint-rules/single-event-definition.mjs';
import rule21 from '../vendor/esm/entries/bpmnlint-rules/start-event-required.mjs';
import rule22 from '../vendor/esm/entries/bpmnlint-rules/sub-process-blank-start-event.mjs';
import rule23 from '../vendor/esm/entries/bpmnlint-rules/superfluous-gateway.mjs';
import rule24 from '../vendor/esm/entries/bpmnlint-rules/superfluous-label.mjs';
import rule25 from '../vendor/esm/entries/bpmnlint-rules/superfluous-termination.mjs';

const cache = {
  'rule:bpmnlint/ad-hoc-sub-process': rule0,
  'rule:bpmnlint/conditional-flows': rule1,
  'rule:bpmnlint/end-event-required': rule2,
  'rule:bpmnlint/event-based-gateway': rule3,
  'rule:bpmnlint/event-sub-process-typed-start-event': rule4,
  'rule:bpmnlint/fake-join': rule5,
  'rule:bpmnlint/global': rule6,
  'rule:bpmnlint/label-required': rule7,
  'rule:bpmnlint/link-event': rule8,
  'rule:bpmnlint/no-bpmndi': rule9,
  'rule:bpmnlint/no-complex-gateway': rule10,
  'rule:bpmnlint/no-disconnected': rule11,
  'rule:bpmnlint/no-duplicate-sequence-flows': rule12,
  'rule:bpmnlint/no-gateway-join-fork': rule13,
  'rule:bpmnlint/no-implicit-split': rule14,
  'rule:bpmnlint/no-implicit-end': rule15,
  'rule:bpmnlint/no-implicit-start': rule16,
  'rule:bpmnlint/no-inclusive-gateway': rule17,
  'rule:bpmnlint/no-overlapping-elements': rule18,
  'rule:bpmnlint/single-blank-start-event': rule19,
  'rule:bpmnlint/single-event-definition': rule20,
  'rule:bpmnlint/start-event-required': rule21,
  'rule:bpmnlint/sub-process-blank-start-event': rule22,
  'rule:bpmnlint/superfluous-gateway': rule23,
  'rule:bpmnlint/superfluous-label': rule24,
  'rule:bpmnlint/superfluous-termination': rule25,
};

const rules = {
  'ad-hoc-sub-process': 'error',
  'conditional-flows': 'error',
  'end-event-required': 'error',
  'event-based-gateway': 'error',
  'event-sub-process-typed-start-event': 'error',
  'fake-join': 'warn',
  'global': 'warn',
  'label-required': 'error',
  'link-event': 'error',
  'no-bpmndi': 'error',
  'no-complex-gateway': 'error',
  'no-disconnected': 'error',
  'no-duplicate-sequence-flows': 'error',
  'no-gateway-join-fork': 'error',
  'no-implicit-split': 'error',
  'no-implicit-end': 'error',
  'no-implicit-start': 'error',
  'no-inclusive-gateway': 'warn',
  'no-overlapping-elements': 'warn',
  'single-blank-start-event': 'error',
  'single-event-definition': 'error',
  'start-event-required': 'error',
  'sub-process-blank-start-event': 'error',
  'superfluous-gateway': 'warn',
  'superfluous-label': 'warn',
  'superfluous-termination': 'warn',
};

export default {
  config: { rules },
  resolver: new StaticResolver(cache)
};
