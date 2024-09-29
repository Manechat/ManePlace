import EventEmitter from "events";



export default class ChannelTracker extends EventEmitter
{
	constructor()
	{
		super();

		this._channels = new Set();
	}

	getChannelCount()
	{
		return this._channels.size;
	}

	open(channel)
	{
		this._channels.add(channel);
		channel.write("event: hello\n\n");
		this.emit("open", { channel, timestamp: Date.now() });
	}

	close(channel)
	{
		this._channels.delete(channel);
		this.emit("close", { channel, timestamp: Date.now() });
	}

	sendAll(event, data)
	{
		for (const channel of this._channels)
		{
			channel.write(`event: ${event}\n`);
			channel.write(`data: ${JSON.stringify(data)}\n\n`);
		}
	}
}