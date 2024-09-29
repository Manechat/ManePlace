#version 300 es

layout(location=0) in vec3 Position;
layout(location=1) in vec2 UV;

uniform mat3 ProjectionViewMatrix;

out vec2 TexCoord;

void main()
{
	vec3 pos = ProjectionViewMatrix * vec3(Position.xy, 1.0);

	gl_Position = vec4(pos.xy, Position.z, 1.0);

	TexCoord = UV;
}