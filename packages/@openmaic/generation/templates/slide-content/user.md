# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{teacherContext}}

## Available Resources

{{#if mediaElementEnabled}}
- **Available Media**: {{assignedImages}}
{{/if}}
- **Canvas Size**: {{canvas_width}} × {{canvas_height}} px

## Output Requirements

Based on the scene information above, generate a complete Canvas/PPT component for one page.

## Language Directive
{{languageDirective}}

**Must Follow**:

1. Output pure JSON directly, without any explanation or description
2. Do not wrap with ```json code blocks
3. Do not add any text before or after the JSON
4. Ensure the JSON format is correct and can be parsed directly
{{#if imageElementEnabled}}
- Use only the provided image IDs (for example, `img_1`) for source image `src` fields
{{/if}}
{{#if generatedVideoEnabled}}
- Use only the provided generated video media refs for video `mediaRef` fields
{{/if}}
5. All TextElement `height` values must be selected from the quick reference table in the system prompt

**Output Structure Example**:
{"background":{"type":"solid","color":"#CCD3BA"},"elements":[{"id":"plate_001","type":"shape","left":50,"top":126,"width":900,"height":386,"path":"M 0 0 L 1 0 L 1 1 L 0 1 Z","viewBox":[1,1],"fill":"#111111","fixedRatio":false,"outline":{"width":1,"style":"solid","color":"#3C3C36"}},{"id":"title_001","type":"text","left":60,"top":50,"width":880,"height":70,"content":"<p style=\"font-size:32px;font-family:IBM Plex Sans;font-weight:600;color:#111111;\">Title content</p>","defaultFontName":"IBM Plex Sans","defaultColor":"#111111"},{"id":"content_001","type":"text","left":80,"top":158,"width":840,"height":130,"content":"<p style=\"font-size:18px;font-family:IBM Plex Sans;color:#F3EEDD;\">Point one</p><p style=\"font-size:18px;font-family:IBM Plex Sans;color:#F3EEDD;\">Point two</p><p style=\"font-size:18px;font-family:IBM Plex Sans;color:#F3EEDD;\">Point three</p>","defaultFontName":"IBM Plex Sans","defaultColor":"#F3EEDD"}]}
