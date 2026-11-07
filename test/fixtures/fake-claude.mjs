#!/usr/bin/env node
// Test double for the Claude Code CLI (`claude -p --output-format json`).
//
// Records how it was called in ./fake-claude-call.json (the chat working directory) and
// behaves according to keywords in the prompt:
//   ADD_TASK  adds a task to ./diagram.bpmn      BREAK  writes invalid content to it
//   FAIL      reports an error result            CRASH  exits with code 3 and no JSON
//   SLOW      answers after 1.5 s                otherwise answers without changes

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const args = process.argv.slice(2);
const prompt = fs.readFileSync(0, 'utf8');
const resume = args.indexOf('--resume');
const sessionId = resume === -1 ? randomUUID() : args[resume + 1];

fs.writeFileSync('fake-claude-call.json', JSON.stringify({ args, prompt }));

const answer = (result) =>
  process.stdout.write(JSON.stringify({ is_error: false, result, session_id: sessionId, total_cost_usd: 0.01 }));

if (prompt.includes('FAIL')) {
  process.stdout.write(JSON.stringify({ is_error: true, result: 'Simulated failure' }));
} else if (prompt.includes('CRASH')) {
  process.stderr.write('simulated crash');
  process.exit(3);
} else if (prompt.includes('BREAK')) {
  fs.writeFileSync('diagram.bpmn', 'this is not a diagram');
  answer('Broke the diagram');
} else if (prompt.includes('ADD_TASK')) {
  const xml = fs.readFileSync('diagram.bpmn', 'utf8');
  fs.writeFileSync('diagram.bpmn', xml.replace('</bpmn:process>', '  <bpmn:task id="Activity_Added" name="Added" />\n  </bpmn:process>'));
  answer('Added a task');
} else if (prompt.includes('SLOW')) {
  setTimeout(() => answer('Slow answer'), 1500);
} else {
  answer('Just an answer');
}
