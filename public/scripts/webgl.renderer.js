import { VertexArray, VertexBuffer } from "./webgl.wrapper.js";
import Matrix3 from "./math.matrix3.js";



export class DataType
{
	static UBYTE = new DataType("UNSIGNED_BYTE", 1, "setUint8");
	static FLOAT = new DataType("FLOAT",		 4, "setFloat32");

	constructor(name, size, funcName)
	{
		this.name = name;
		this.size = size;
		this.funcName = funcName;
	}
}

export class VertexFormat
{
	constructor(attributes)
	{
		this.attributes = attributes;
		
		this.size = 0;
		this.count = 0;

		// do some preprocessing for later
		attributes.reduce((offset, attribute) =>
		{
			const attributeSize = attribute.count * attribute.type.size;

			// calculate the total size and component count of all attributes
			this.size += attributeSize;
			this.count += attribute.count;

			// calculate the total and component offsets for each attribute
			attribute.offset = offset;
			attribute.componentOffsets = [];

			for(let i = 0; i < attribute.count; ++i)
			{
				attribute.componentOffsets.push(offset + attribute.type.size * i);
			}

			return offset + attributeSize;
		}, 0);
	}

	defineAttributes(buffer)
	{
		this.attributes.forEach((attribute, index) =>
		{
			buffer.attribute(index, attribute.count, buffer._gl[attribute.type.name], attribute.normalized === true, this.size, attribute.offset);
		});
	}

	putInBuffer(buffer, values, vertexOffset)
	{
		if(values.length !== this.count)
		{
			throw new Error(`Received ${values.length} attributes, but vertex format is ${this.count}`);
		}

		let index = 0;

		for(const attribute of this.attributes)
		{
			for(const offset of attribute.componentOffsets)
			{
				buffer[attribute.type.funcName] (offset + vertexOffset * this.size, values[index++], true); // little endian
			}
		}
	}
}

export class VertexBatch
{
	constructor(gl, capacity, format, shader, begin, end)
	{
		this._gl = gl;
		this.capacity = capacity;
		this.format = format;
		this.shader = shader;
		this.begin = begin;
		this.end = end;

		this._vertexCount = 0;
		this._vertexData = new DataView(new ArrayBuffer(format.size * capacity));

		this._array = new VertexArray(gl);
		this._buffer = new VertexBuffer(gl, format.size * capacity, gl.DYNAMIC_DRAW);

		this._array.bind();
		this._buffer.bind();
		this.format.defineAttributes(this._buffer);
	}

	vertex()
	{
		this.format.putInBuffer(this._vertexData, [ ...arguments ].flat(), this._vertexCount);
		this._vertexCount++;
	}

	clear()
	{
		this._vertexCount = 0;
	}

	flush(beginIn, endIn)
	{
		// bind shader and run setup tasks
		this.shader.bind();
		this.begin?.(this.shader);
		   beginIn?.(this.shader);

		// update the buffer and draw
		this._buffer.bind();
		this._buffer.update(0, this._vertexData);
		this._array.bind();
		this._gl.drawArrays(this._gl.TRIANGLES, 0, this._vertexCount);

		// run cleanup tasks
		this.end?.(this.shader);
		   endIn?.(this.shader);

		this.clear();
	}
}

export class Camera
{
	constructor()
	{
		this.x = 0;
		this.y = 0;

		this.width = 0;
		this.height = 0;

		this.zoom = 1;

		this._matrix = Matrix3.identity();
	}

	cameraMatrix()
	{
		return this._matrix
			.identity()
			.translate(this.x, this.y)
			.scale(1 / this.zoom)
			.translate(-this.width / 2, -this.height / 2)
	}

	viewMatrix()
	{
		return this.cameraMatrix().inverse();
	}

	screenToWorld(x, y)
	{
		return this.cameraMatrix().transform(x, y, 1);
	}

	worldToScreen(x, y)
	{
		return this.viewMatrix().transform(x, y, 1);
	}
}

function resize(canvas)
{
	if(canvas.width === canvas.clientWidth && canvas.height === canvas.clientHeight)
	{
		return false;
	}

	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	return true;
}

export class Renderer
{
	constructor(gl, camera)
	{
		this._gl = gl;
		this.camera = camera;

		this._projectionMatrix = Matrix3.identity();
		this._projectionViewMatrix = Matrix3.identity();

		this.batches = [];
	}

	resize()
	{
		// resize the canvas to fit the browser window
		if(resize(this._gl.canvas))
		{
			this.camera.width = this._gl.canvas.width;
			this.camera.height = this._gl.canvas.height;

			this._gl.viewport(0, 0, this._gl.canvas.width, this._gl.canvas.height);

			this._projectionMatrix.projection(this._gl.canvas.width, this._gl.canvas.height);

			return true;
		}

		return false;
	}

	render()
	{
		// calculate the projection-view matrix
		this._projectionViewMatrix.set(this._projectionMatrix).multiply(this.camera.viewMatrix());

		// reset canvas
		this._gl.clearColor(0.2, 0.2, 0.2, 1);
		this._gl.clear(this._gl.COLOR_BUFFER_BIT | this._gl.DEPTH_BUFFER_BIT);

		// enable premultiplied alpha blending
		this._gl.enable(this._gl.BLEND);
		this._gl.blendFunc(this._gl.ONE, this._gl.ONE_MINUS_SRC_ALPHA);

		// enable depth testing
		this._gl.enable(this._gl.DEPTH_TEST);
		this._gl.depthFunc(this._gl.LEQUAL);

		// draw all batches
		for(const batch of this.batches)
		{
			batch.flush(shader => shader.findUniform("ProjectionViewMatrix").setm3fv(this._projectionViewMatrix));
		}
	}
}