Array.prototype.groupBy = function(criteria)
{
	return this.reduce((groupings, item) =>
	{
		const key = criteria(item);

		if(key != null) // also checks undefined
		{
			groupings[key] ??= [];
			groupings[key].push(item);
		}

		return groupings;
	}, {});
}

function startInterval(intervalTimeMs, action)
{
	setInterval(action, intervalTimeMs);
	action();
}

module.exports = { startInterval };