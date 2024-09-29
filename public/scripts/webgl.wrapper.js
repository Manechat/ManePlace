import { LazyMap } from "./util.js";



function createShader(gl, type, source)
{
	const shader = gl.createShader(type);

	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS))
	{
		return shader;
	}

	console.log(gl.getShaderInfoLog(shader));

	gl.deleteShader(shader);
}

function createProgram(gl, vertexSource, fragmentSource)
{
	const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragmentShader = createShader(gl ,gl.FRAGMENT_SHADER, fragmentSource);

	const program = gl.createProgram();

	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	if (gl.getProgramParameter(program, gl.LINK_STATUS))
	{
		return program;
	}

	console.log(gl.getProgramInfoLog(program));
	
	gl.deleteProgram(program);
}



class Uniform
{
	constructor(gl, id)
	{
		this._gl = gl;
		this._id = id;
	}

	setm2fv(matrix)
	{
		this._gl.uniformMatrix2fv(this._id, false, matrix.values ?? matrix); // arg is matrix (has values field) or array
	}

	setm3fv(matrix)
	{
		this._gl.uniformMatrix3fv(this._id, false, matrix.values ?? matrix);
	}

	setm4fv(matrix)
	{
		this._gl.uniformMatrix4fv(this._id, false, matrix.values ?? matrix);
	}
}



export class Shader
{
	constructor(gl, vertexSource, fragmentSource)
	{
		this._gl = gl;
		this._id = createProgram(gl, vertexSource, fragmentSource);

		this._uniforms = new LazyMap();
	}

	findUniform(uniformName)
	{
		return this._uniforms.get(uniformName, () => new Uniform(this._gl, this._gl.getUniformLocation(this._id, uniformName)));
	}

	bind()
	{
		this._gl.useProgram(this._id);
	}

	unbind()
	{
		this._gl.useProgram(null);
	}
}

export class Texture
{
	constructor(gl, unit, image)
	{
		this._gl = gl;
		this.unit = unit;
		this.width = image?.width ?? 0;
		this.height = image?.height ?? 0;

		this._id = gl.createTexture();

		gl.bindTexture(gl.TEXTURE_2D, this._id);

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	bind()
	{
		this._gl.activeTexture(this._gl.TEXTURE0 + this.unit);
		this._gl.bindTexture(this._gl.TEXTURE_2D, this._id);
	}

	unbind()
	{
		this._gl.activeTexture(this._gl.TEXTURE0 + this.unit);
		this._gl.bindTexture(this._gl.TEXTURE_2D, null);
	}

	replace(width, height, pixels)
	{
		this.width = width;
		this.height = height;

		this._gl.bindTexture(this._gl.TEXTURE_2D, this._id);
		this._gl.texImage2D(this._gl.TEXTURE_2D, 0, this._gl.RGBA, width, height, 0, this._gl.RGBA, this._gl.UNSIGNED_BYTE, pixels);
		this._gl.bindTexture(this._gl.TEXTURE_2D, null);
	}

	set(x, y, width, height, pixels)
	{
		this._gl.bindTexture(this._gl.TEXTURE_2D, this._id);
		this._gl.texSubImage2D(this._gl.TEXTURE_2D, 0, x, y, width, height, this._gl.RGBA, this._gl.UNSIGNED_BYTE, pixels);
		this._gl.bindTexture(this._gl.TEXTURE_2D, null);
	}

	copy(x, y, texture)
	{
		const fb = this._gl.createFramebuffer();
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, fb);
		this._gl.framebufferTexture2D(this._gl.FRAMEBUFFER, this._gl.COLOR_ATTACHMENT0, this._gl.TEXTURE_2D, texture._id, 0);
		this._gl.bindTexture(this._gl.TEXTURE_2D, this._id);
		this._gl.copyTexSubImage2D(this._gl.TEXTURE_2D, 0, x, y, 0, 0, texture.width, texture.height);
		this._gl.bindTexture(this._gl.TEXTURE_2D, null);
		this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
		this._gl.deleteFramebuffer(fb);
	}
}

export class VertexArray
{
	constructor(gl)
	{
		this._gl = gl;

		this._id = gl.createVertexArray();
	}

	bind()
	{
		this._gl.bindVertexArray(this._id);
	}

	unbind()
	{
		this._gl.bindVertexArray(null);
	}
}

export class VertexBuffer
{
	constructor(gl, dataOrSize, usage)
	{
		this._gl = gl;

		this._id = this._gl.createBuffer();

		this.bind();
		this._gl.bufferData(this._gl.ARRAY_BUFFER, dataOrSize, usage)
		this.unbind();
	}

	bind()
	{
		this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._id);
	}

	unbind()
	{
		this._gl.bindBuffer(this._gl.ARRAY_BUFFER, null);
	}

	update(offset, data)
	{
		this._gl.bufferSubData(this._gl.ARRAY_BUFFER, offset, data);
	}

	attribute(index, size, type, normalized, stride, offset)
	{
		this._gl.enableVertexAttribArray(index);
		this._gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
	}
}