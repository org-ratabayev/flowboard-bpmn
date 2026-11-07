// bpmnlint 'recommended' rule set, packed for bpmn-js-bpmnlint (what bpmnlint-pack-config would generate).
// Same rules and levels as bpmnlint's 'recommended' config.

import StaticResolver from 'bpmnlint/lib/resolver/static-resolver.js';
import rule0 from 'bpmnlint/rules/ad-hoc-sub-process.js';
import rule1 from 'bpmnlint/rules/conditional-flows.js';
import rule2 from 'bpmnlint/rules/end-event-required.js';
import rule3 from 'bpmnlint/rules/event-based-gateway.js';
import rule4 from 'bpmnlint/rules/event-sub-process-typed-start-event.js';
import rule5 from 'bpmnlint/rules/fake-join.js';
import rule6 from 'bpmnlint/rules/global.js';
import rule7 from 'bpmnlint/rules/label-required.js';
import rule8 from 'bpmnlint/rules/link-event.js';
import rule9 from 'bpmnlint/rules/no-bpmndi.js';
import rule10 from 'bpmnlint/rules/no-complex-gateway.js';
import rule11 from 'bpmnlint/rules/no-disconnected.js';
import rule12 from 'bpmnlint/rules/no-duplicate-sequence-flows.js';
import rule13 from 'bpmnlint/rules/no-gateway-join-fork.js';
import rule14 from 'bpmnlint/rules/no-implicit-split.js';
import rule15 from 'bpmnlint/rules/no-implicit-end.js';
import rule16 from 'bpmnlint/rules/no-implicit-start.js';
import rule17 from 'bpmnlint/rules/no-inclusive-gateway.js';
import rule18 from 'bpmnlint/rules/no-overlapping-elements.js';
import rule19 from 'bpmnlint/rules/single-blank-start-event.js';
import rule20 from 'bpmnlint/rules/single-event-definition.js';
import rule21 from 'bpmnlint/rules/start-event-required.js';
import rule22 from 'bpmnlint/rules/sub-process-blank-start-event.js';
import rule23 from 'bpmnlint/rules/superfluous-gateway.js';
import rule24 from 'bpmnlint/rules/superfluous-label.js';
import rule25 from 'bpmnlint/rules/superfluous-termination.js';

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
