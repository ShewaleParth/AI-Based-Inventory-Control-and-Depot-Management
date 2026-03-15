/**
 * Paginate any Mongoose model with filtering, sorting, search.
 * @param  {Model}  Model       - Mongoose model to query
 * @param  {Object} reqQuery    - req.query from Express
 * @param  {string|Object|Array} pop  - optional .populate() argument
 * @returns {Promise<{data, pagination}>}
 */
async function paginate(Model, reqQuery, pop = null) {
    // 1. Extract control params, everything else is a filter
    const {
        page = 1,
        limit = 20,
        sort = '-createdAt',  // default: newest first
        search = null,
        fields = null,          // comma-separated field names
        ...filters
    } = reqQuery;

    // 2. Convert operator syntax to MongoDB operators
    //    URL: ?qty[gte]=10  becomes  { qty: { $gte: 10 } }
    //    Only replaces if not already prefixed with $.
    const queryStr = JSON.stringify(filters).replace(
        /"(gte|gt|lte|lt|eq|ne|in|nin)"\s*:/g,
        '"$$$1":'
    );
    const parsedFilters = JSON.parse(queryStr);

    // 3. Build the query
    let query = Model.find(parsedFilters);

    // 4. Full-text search (requires text index on model)
    if (search) {
        query = query.find({ $text: { $search: search } });
    }

    // 5. Field projection (only return requested fields)
    if (fields) {
        query = query.select(fields.split(',').join(' '));
    }

    // 6. Count total BEFORE applying skip/limit
    const total = await Model.countDocuments(query.getFilter());

    // 7. Apply sort, pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(1000, parseInt(limit)); // max 1000 per page
    const skip = (pageNum - 1) * limitNum;

    query = query.sort(sort).skip(skip).limit(limitNum);

    // 8. Optional population (joins)
    if (pop) query = query.populate(pop);

    // 9. Execute with .lean() for plain JS objects (faster)
    // Ensure that we get simple JSON documents
    const data = await query.lean().exec();

    return {
        data,
        pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
            hasNext: pageNum * limitNum < total,
            hasPrevious: pageNum > 1,
        },
    };
}

module.exports = { paginate };
