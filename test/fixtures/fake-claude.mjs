#!/usr/bin/env node
// Test double for the Claude Code CLI (`claude -p --output-format json`).
//
// Appends how it was called (args, prompt, working directory, diagram) as one JSON line to the
// file in FAKE_CLAUDE_LOG and behaves according to keywords in the prompt:
//   ADD_TASK  adds a task to ./diagram.bpmn      BREAK  writes invalid content to it
//   FAIL      reports an error result            CRASH  exits with code 3 and no JSON
//   SLOW      answers after 1.5 s                otherwise answers without changes

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const args = process.argv.slice(2);
const prompt = fs.readFileSync(0, 'utf8');
const diagram = fs.existsSync('diagram.bpmn') ? fs.readFileSync('diagram.bpmn', 'utf8') : null;

if (process.env.FAKE_CLAUDE_LOG) {
  fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ args, prompt, cwd: process.cwd(), diagram })}\n`);
}

const answer = (result) => process.stdout.write(JSON.stringify({
  is_error: false, result, session_id: randomUUID(), total_cost_usd: 0.01, usage: { input_tokens: 120, output_tokens: 30 }
}));

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
