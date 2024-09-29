export default class Matrix3 // Mutable
{
	// helper that converts either n input values, input matrix, or input array to an array
	static _extract9(args)
	{
		return	args.length === 9 ? args : // 9 values
				args[0]?.length === 9 ? args[0] : // array
				args[0]?.values?.length === 9 ? args[0].values : // matrix
				null; // no match
	}

	static _extract2(args)
	{
		return 	args.length === 2 ? args : // 2 values
				args.length === 1 ? [ args[0], args[0] ] : // 1 value
				null; // no match
	}

	constructor()
	{
		this.values = [];
		this.identity();
	}

	static identity()
	{
		return new Matrix3();
	}

	copy()
	{
		return new Matrix3().set(this);
	}

	identity()
	{
		this.values[0] = 1.0;
		this.values[1] = 0.0;
		this.values[2] = 0.0;
		this.values[3] = 0.0;
		this.values[4] = 1.0;
		this.values[5] = 0.0;
		this.values[6] = 0.0;
		this.values[7] = 0.0;
		this.values[8] = 1.0;
		
		return this;
	}

	set(...args)
	{
		const values = Matrix3._extract9(args);

		for(let i = 0; i < this.values.length; ++i)
		{
			this.values[i] = values[i];
		}

		return this;
	}

	projection(width, height)
	{
		this.values[0] =  2.0 / width;
		this.values[1] =  0.0;
		this.values[2] =  0.0;

		this.values[3] =  0.0;
		this.values[4] = -2.0 / height;
		this.values[5] =  0.0;

		this.values[6] = -1.0;
		this.values[7] =  1.0;
		this.values[8] =  1.0;

		return this;
	}

	translate(...args)
	{
		const [tx, ty] = Matrix3._extract2(args);

		return this.multiply(
			1.0, 0.0, 0.0,
			0.0, 1.0, 0.0,
			tx,  ty,  1.0,
		);
	}

	rotate(angleRad)
	{
		const cos = Math.cos(angleRad);
		const sin = Math.sin(angleRad);

		return this.multiply(
			 cos, sin, 0.0,
			-sin, cos, 0.0,
			 0.0, 0.0, 1.0,
		);
	}

	scale(...args)
	{
		const [sx, sy] = Matrix3._extract2(args);

		return this.multiply(
			sx,  0.0, 0.0,
			0.0, sy,  0.0,
			0.0, 0.0, 1.0,
		);
	}

	multiply(...args)
	{
		const a = this.values;
		const b = Matrix3._extract9(args);

		const a00 = a[0];
		const a01 = a[1];
		const a02 = a[2];
		const a10 = a[3];
		const a11 = a[4];
		const a12 = a[5];
		const a20 = a[6];
		const a21 = a[7];
		const a22 = a[8];

		const b00 = b[0];
		const b01 = b[1];
		const b02 = b[2];
		const b10 = b[3];
		const b11 = b[4];
		const b12 = b[5];
		const b20 = b[6];
		const b21 = b[7];
		const b22 = b[8];

		a[0] = b00 * a00 + b01 * a10 + b02 * a20;
		a[1] = b00 * a01 + b01 * a11 + b02 * a21;
		a[2] = b00 * a02 + b01 * a12 + b02 * a22;
		a[3] = b10 * a00 + b11 * a10 + b12 * a20;
		a[4] = b10 * a01 + b11 * a11 + b12 * a21;
		a[5] = b10 * a02 + b11 * a12 + b12 * a22;
		a[6] = b20 * a00 + b21 * a10 + b22 * a20;
		a[7] = b20 * a01 + b21 * a11 + b22 * a21;
		a[8] = b20 * a02 + b21 * a12 + b22 * a22;

		return this;
	}

	inverse()
	{
		const a = this.values;

		const a00 = a[0];
		const a01 = a[1];
		const a02 = a[2];
		const a10 = a[3];
		const a11 = a[4];
		const a12 = a[5];
		const a20 = a[6];
		const a21 = a[7];
		const a22 = a[8];

		const det =	a00 * (a11 * a22 - a21 * a12) -
					a01 * (a10 * a22 - a12 * a20) +
					a02 * (a10 * a21 - a11 * a20);
		const invdet = 1 / det;

		a[0] = (a11 * a22 - a21 * a12) * invdet;
		a[1] = (a02 * a21 - a01 * a22) * invdet;
		a[2] = (a01 * a12 - a02 * a11) * invdet;
		a[3] = (a12 * a20 - a10 * a22) * invdet;
		a[4] = (a00 * a22 - a02 * a20) * invdet;
		a[5] = (a10 * a02 - a00 * a12) * invdet;
		a[6] = (a10 * a21 - a20 * a11) * invdet;
		a[7] = (a20 * a01 - a00 * a21) * invdet;
		a[8] = (a00 * a11 - a10 * a01) * invdet;

		return this;
	}

	transform(x, y, z)
	{
		const a = this.values;
		const out = [];

		out[0] = x * a[0] + y * a[3] + z * a[6];
		out[1] = x * a[1] + y * a[4] + z * a[7];
		out[2] = x * a[2] + y * a[5] + z * a[8];

		return out;
	}
}