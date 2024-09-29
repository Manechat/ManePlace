import { LazyMap } from "./util.js";



/*
class MultiEventPublisher
{
	constructor()
	{
		this._eventsToListeners = new LazyMap();
		this._listenersToEvents = new Map();
	}

	subscribe(events, listener)
	{
		if (!events?.forEach) events = [ events ];
		events?.forEach( e => this._eventsToListeners.get(e, () => new Set()).add(listener) );
		this._listenersToEvents.set(listener, events);
	}

	unsubscribe(listener)
	{
		this._listenersToEvents.get(listener)?.forEach( e => this._eventsToListeners.get(e).delete(listener) );
		this._listenersToEvents.delete(listener);
	}

	publish(event, executor)
	{
		this._eventsToListeners.get(event)?.forEach( f => executor(f, this._listenersToEvents.get(f)) );
	}
}

class Bindable extends MultiEventPublisher
{
	bind(object, events, listener)
	{
		this.subscribe(events, listener.bind(object));
	}
}
*/

class Publisher
{
	constructor()
	{
		this._listeners = new LazyMap();
	}

	subscribe(...args)
	{
		const listener = args.pop();
		args.forEach(e => this._listeners.get(e, () => new Set()).add(listener));
	}

	publish(event, value)
	{
		this._listeners.get(event)?.forEach(f => f(value));
	}
}

export default function(initialState) // TODO: This only tracks top level properties
{
	return new Proxy(Object.assign(new Publisher(), initialState), {
		set(state, key, value)
		{
			state[key] = value;
			state.publish(key, state);
			return true;
		}
	});
}