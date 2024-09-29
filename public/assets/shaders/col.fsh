#version 300 es
precision highp float;

in vec4 FragColor;

uniform sampler2D Sampler;

out vec4 fragColor;

void main()
{
	fragColor = FragColor;
}