const GreenlockExpress = require("greenlock-express");
const ExpressWS = require("express-ws");

const app = require("./main.js");

GreenlockExpress
	.init({ packageRoot: __dirname, configDir: "./greenlock.d", cluster: false, maintainerEmail: "mercurialpone@gmail.com" })
	.ready(glx =>
	{
		ExpressWS(app, glx.httpsServer());
		app.setUpSockets();
	})
	.serve(app);