#version 300 es
precision highp float;

in vec2 TexCoord;

uniform sampler2D Sampler;

out vec4 fragColor;

void main()
{
	fragColor = texture(Sampler, TexCoord);
}