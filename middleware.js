import Crypto from "crypto";



export function helpers(_, res, next)
{
	res.status = c =>
	{
		res.statusCode = c;
		return res;
	};

	res.json = o =>
	{
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify(o));
	};

	res.redirect = u =>
	{
		res.writeHead(302, { "Location": u });
		res.end();
	};

	next();
}

export function json(req, _, next)
{
	req.body = {};

	const chunks = [];

	req.on("data", chunk => chunks.push(chunk));

	req.on("end", () =>
	{
		try { req.body = JSON.parse(Buffer.concat(chunks).toString()); }
		catch(_) {}

		next();
	});

	req.on("error", next);
}

function parseCookies(string)
{
	const cookies = {};

	for (const pair of string.split(";"))
	{
		const i = pair.indexOf("=");
		if (i < 0) continue;
		const key = pair.slice(0, i).trim();
		const value = pair.slice(i + 1);
		cookies[key] = value;
	}

	return cookies;
}

export function session({ maxAge = 30 * 24 * 60 * 60, secure = true, httpOnly = true, sameSite = "Strict" } = {})
{
	const sessionMap = new Map();

	return (req, res, next) =>
	{
		res.createSession = data =>
		{
			const sessionId = Crypto.randomBytes(36).toString("base64");
			const session = Object.assign({ sessionId }, data);
			sessionMap.set(sessionId, session);

			let cookie = [ `sessionId=${sessionId}`, "Path=/" ];
			if (maxAge) cookie.push(`Max-Age=${maxAge}`);
			if (secure) cookie.push("Secure");
			if (httpOnly) cookie.push("HttpOnly");
			if (sameSite) cookie.push(`SameSite=${sameSite}`);

			res.setHeader("Set-Cookie", cookie.join("; "));

			return session;
		};

		res.deleteSession = sessionId =>
		{
			sessionMap.delete(sessionId);
		};

		if (!req.session && typeof req.headers.cookie === "string")
		{
			req.session = sessionMap.get(parseCookies(req.headers.cookie).sessionId);
		}

		next();
	};
}