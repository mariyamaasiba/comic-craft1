export function responseText(result) {
  if (result?.output_text) return result.output_text;
  const stepText = result?.steps?.flatMap(step => step.type === 'model_output'
    ? step.content?.filter(content => content.type === 'text').map(content => content.text || '') || []
    : []).join('');
  if (stepText) return stepText;
  return result?.outputs?.filter(output => output.type === 'text').map(output => output.text).join('\n') || '';
}
