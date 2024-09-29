// TODO: Index channels by object reference instead of string?
export default class AudioMixer
{
	constructor(ctx)
	{
		this._ctx = ctx;

		this._channels = new Map();

		this.createChannel("master", null);
	}

	getChannel(channel)
	{
		return this._channels.get(channel);
	}

	createChannel(channel, parent = "master")
	{
		const node = this._ctx.createGain();
		const parentNode = parent ? this._ctx.get(parent) : this._ctx.destination;

		node.connect(parentNode);

		this._channels.set(channel, node);

		return node;
	}

	async load(src)
	{
		const result = await fetch(src);
		const body = await result.arrayBuffer();
		const buf = await this._ctx.decodeAudioData(body);
		return new PlayableAudio(this, buf);
	}
}

class PlayableAudio
{
	constructor(mixer, buf)
	{
		this._mixer = mixer;
		this._buf = buf;

		this._out = this._mixer._ctx.createGain();
	}

	get volume()
	{
		return this._out.gain.value;
	}

	set volume(value)
	{
		this._out.gain.value = value;
	}

	play(channel = "master")
	{
		this._out.disconnect();
		this._out.connect(this._mixer.getChannel(channel));

		const source = this._mixer._ctx.createBufferSource();
		source.buffer = this._buf;
		source.connect(this._out);
		source.start();
	}
}