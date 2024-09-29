export function renderTexturedQuad(batch, centerX, centerY, centerZ, width, height)
{
	batch.vertex(-0.5 * width + centerX, -0.5 * height + centerY, centerZ,   0, 0);
	batch.vertex(-0.5 * width + centerX,  0.5 * height + centerY, centerZ,   0, 1);
	batch.vertex( 0.5 * width + centerX,  0.5 * height + centerY, centerZ,   1, 1);

	batch.vertex(-0.5 * width + centerX, -0.5 * height + centerY, centerZ,   0, 0);
	batch.vertex( 0.5 * width + centerX,  0.5 * height + centerY, centerZ,   1, 1);
	batch.vertex( 0.5 * width + centerX, -0.5 * height + centerY, centerZ,   1, 0);
}

export function renderQuadWith(batch, centerX, centerY, centerZ, width, height, ...data)
{
	batch.vertex(-0.5 * width + centerX, -0.5 * height + centerY, centerZ,   data);
	batch.vertex(-0.5 * width + centerX,  0.5 * height + centerY, centerZ,   data);
	batch.vertex( 0.5 * width + centerX,  0.5 * height + centerY, centerZ,   data);

	batch.vertex(-0.5 * width + centerX, -0.5 * height + centerY, centerZ,   data);
	batch.vertex( 0.5 * width + centerX,  0.5 * height + centerY, centerZ,   data);
	batch.vertex( 0.5 * width + centerX, -0.5 * height + centerY, centerZ,   data);
}

export class Sprite
{
	constructor(render)
	{
		this.x = 0;
		this.y = 0;

		this.render = render;
	}
}