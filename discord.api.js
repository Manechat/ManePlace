import WebSocket from 'ws';
import Crypto from "crypto";
import { EventEmitter } from 'events';
import { LazyMap } from "./util.js";



class Waitable
{
	constructor(emitter, event)
	{
		this._emitter = emitter;
		this._event = event;
		this._condition = null;
	}

	that(condition)
	{
		this._condition = condition;
		return this;
	}

	wait(timeMs)
	{
		return new Promise((resolve, reject) =>
		{
			let timeout = null;
			let handler = null;

			handler = d =>
			{
				if (this._condition && !this._condition(d)) return;
				this._emitter.off(this._event, handler);
				clearTimeout(timeout);
				resolve(d);
			};

			this._emitter.on(this._event, handler);

			if (!timeMs || timeMs <= 0) return;

			timeout = setTimeout(() =>
			{
				this._emitter.off(this._event, handler);
				reject(`Promise timed out after ${timeMs}ms`);
			}, timeMs);
		});
	}
}

class OutgoingCloseCode
{
	// static NORMAL = 1000;
	static RESUME = 4200;
}

class Opcode
{
	static DISPATCH = 0;
	static HEARTBEAT = 1;
	static IDENTIFY = 2;
	static RESUME = 6;
	static RECONNECT = 7;
	static REQUEST_GUILD_MEMBERS = 8;
	static INVALID_SESSION = 9;
	static HELLO = 10;
	static HEARTBEAT_ACK = 11;
}

export class Intent
{
	static GUILDS = 1 << 0;
	static GUILD_MEMBERS = 1 << 1;
}

export class GatewayClient extends EventEmitter // TODO: Timeouts on waits
{
	static INITIAL_GATEWAY_URL = "wss://gateway.discord.gg";
	static GATEWAY_PARAMETERS = "v=10&encoding=json";

	constructor(token, intents)
	{
		super();

		this._token = token;
		this._intents = intents;

		this._ws = null;

		this._heartbeat = null;

		this._sequence = null;
		this._sessionId = null;
		this._resumeGatewayUrl = null;
	}

	next(event)
	{
		return new Waitable(this, event);
	}

	_send(data)
	{
		this._ws.send(JSON.stringify(data));
	}

	_sendHeartbeat()
	{
		this._send({ op: Opcode.HEARTBEAT, d: this._sequence });
	}

	getGuildMembers(guildId, userIds)
	{
		const nonce = Crypto.randomBytes(24).toString("base64");
		this._send({ op: Opcode.REQUEST_GUILD_MEMBERS, d: { guild_id: guildId, user_ids: userIds, limit: 0, nonce } });
		return this.next("GUILD_MEMBERS_CHUNK").that(e => e.nonce == nonce).wait();
	}

	async _connect(force)
	{
		if (this._ws)
		{
			this._ws.onclose = null;
			this._ws.onerror = null;
			this._ws.onmessage = null;
			this._ws.close(OutgoingCloseCode.RESUME);
			clearInterval(this._heartbeat);
		}

		// always try to resume UNLESS we don't have the resume url OR we forced a re-identify
		const resume = !force && this._sequence && this._sessionId && this._resumeGatewayUrl;

		if (resume) console.log("Attempting resume...");
		else console.log("Attempting identify...");

		const url = resume ? this._resumeGatewayUrl : GatewayClient.INITIAL_GATEWAY_URL;
		this._ws = new WebSocket(`${url}?${GatewayClient.GATEWAY_PARAMETERS}`);
		this._ws.onclose = e => this._close(e.code, e.reason);
		this._ws.onerror = e => this._error(e);
		this._ws.onmessage = e => this._handle(JSON.parse(e.data));

		const hello = await this.next("message").that(p => p.op == Opcode.HELLO).wait(); // TODO: Potentially don't wait for hello
		this._heartbeat = setInterval(this._sendHeartbeat.bind(this), hello.d.heartbeat_interval);

		if (resume)
		{
			this._send({ op: Opcode.RESUME, d: { token: this._token, session_id: this._sessionId, seq: this._sequence } });
		}
		else
		{
			this._send({ op: Opcode.IDENTIFY, d: { token: this._token, intents: this._intents, properties: { os: "linux", browser: "maneplace", device: "maneplace" } } });
			const ready = await this.next("READY").wait();
			this._sessionId = ready.session_id;
			this._resumeGatewayUrl = ready.resume_gateway_url;
	
			return ready.user;
		}
	}

	login()
	{
		return this._connect();
	}

	_handle(payload)
	{
		this.emit("message", payload);

		if (payload.s) this._sequence = payload.s;

		if (payload.op == Opcode.DISPATCH) this.emit(payload.t, payload.d);
		else if (payload.op == Opcode.HEARTBEAT) this._sendHeartbeat();
		else if (payload.op == Opcode.RECONNECT) this._connect();
		else if (payload.op == Opcode.INVALID_SESSION) this._connect(true);
	}

	_close(code, reason)
	{
		this.emit("close", code, reason);
		this._connect(); // TODO: Max retries
	}

	_error(event)
	{
		this.emit("error", event);
		this._connect();
	}
}

export class Client // TODO: Also implement a general user cache for users that are not in the server (left/banned/etc)
{
	constructor(token, intents)
	{
		this._gatewayClient = new GatewayClient(token, intents);

		this._guildCache = new LazyMap(); // TODO: Clear on gateway re-identify
		
		this._gatewayClient.on("GUILD_MEMBER_ADD", e =>
		{
			this._guildCache.get(e.guild_id, () => new LazyMap()).set(e.user.id, e);
		});

		this._gatewayClient.on("GUILD_MEMBER_REMOVE", e =>
		{
			this._guildCache.get(e.guild_id, () => new LazyMap()).set(e.user.id, null);
		});

		this._gatewayClient.on("GUILD_MEMBER_UPDATE", e =>
		{
			const memberCache = this._guildCache.get(e.guild_id, () => new LazyMap());
			const member = memberCache.get(e.user.id);
			if (member) memberCache.set(e.user.id, Object.assign(member, e));
		});
	}

	login()
	{
		return this._gatewayClient.login();
	}

	async getGuildMember(guildId, userId)
	{
		if (!userId) return null; // TODO: validate guildId/userId snowflakes

		const memberCache = this._guildCache.get(guildId, () => new LazyMap());
		let member = memberCache.get(userId);

		if (member === undefined) // Use null to check if we already fetched before
		{
			const fetched = await this._gatewayClient.getGuildMembers(guildId, userId);
			member = fetched.members[0] || null;
			memberCache.set(userId, member);
		}

		return member;
	}
}