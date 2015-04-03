(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// ordered: bool.
// old_results and new_results: collections of documents.
//    if ordered, they are arrays.
//    if unordered, they are IdMaps
LocalCollection._diffQueryChanges = function (ordered, oldResults, newResults,
                                              observer, options) {
  if (ordered)
    LocalCollection._diffQueryOrderedChanges(
      oldResults, newResults, observer, options);
  else
    LocalCollection._diffQueryUnorderedChanges(
      oldResults, newResults, observer, options);
};

LocalCollection._diffQueryUnorderedChanges = function (oldResults, newResults,
                                                       observer, options) {
  options = options || {};
  var projectionFn = options.projectionFn || EJSON.clone;

  if (observer.movedBefore) {
    throw new Error("_diffQueryUnordered called with a movedBefore observer!");
  }

  newResults.forEach(function (newDoc, id) {
    var oldDoc = oldResults.get(id);
    if (oldDoc) {
      if (observer.changed && !EJSON.equals(oldDoc, newDoc)) {
        var projectedNew = projectionFn(newDoc);
        var projectedOld = projectionFn(oldDoc);
        var changedFields =
              LocalCollection._makeChangedFields(projectedNew, projectedOld);
        if (! _.isEmpty(changedFields)) {
          observer.changed(id, changedFields);
        }
      }
    } else if (observer.added) {
      var fields = projectionFn(newDoc);
      delete fields._id;
      observer.added(newDoc._id, fields);
    }
  });

  if (observer.removed) {
    oldResults.forEach(function (oldDoc, id) {
      if (!newResults.has(id))
        observer.removed(id);
    });
  }
};


LocalCollection._diffQueryOrderedChanges = function (old_results, new_results,
                                                     observer, options) {
  options = options || {};
  var projectionFn = options.projectionFn || EJSON.clone;

  var new_presence_of_id = {};
  _.each(new_results, function (doc) {
    if (new_presence_of_id[doc._id])
      Meteor._debug("Duplicate _id in new_results");
    new_presence_of_id[doc._id] = true;
  });

  var old_index_of_id = {};
  _.each(old_results, function (doc, i) {
    if (doc._id in old_index_of_id)
      Meteor._debug("Duplicate _id in old_results");
    old_index_of_id[doc._id] = i;
  });

  // ALGORITHM:
  //
  // To determine which docs should be considered "moved" (and which
  // merely change position because of other docs moving) we run
  // a "longest common subsequence" (LCS) algorithm.  The LCS of the
  // old doc IDs and the new doc IDs gives the docs that should NOT be
  // considered moved.

  // To actually call the appropriate callbacks to get from the old state to the
  // new state:

  // First, we call removed() on all the items that only appear in the old
  // state.

  // Then, once we have the items that should not move, we walk through the new
  // results array group-by-group, where a "group" is a set of items that have
  // moved, anchored on the end by an item that should not move.  One by one, we
  // move each of those elements into place "before" the anchoring end-of-group
  // item, and fire changed events on them if necessary.  Then we fire a changed
  // event on the anchor, and move on to the next group.  There is always at
  // least one group; the last group is anchored by a virtual "null" id at the
  // end.

  // Asymptotically: O(N k) where k is number of ops, or potentially
  // O(N log N) if inner loop of LCS were made to be binary search.


  //////// LCS (longest common sequence, with respect to _id)
  // (see Wikipedia article on Longest Increasing Subsequence,
  // where the LIS is taken of the sequence of old indices of the
  // docs in new_results)
  //
  // unmoved: the output of the algorithm; members of the LCS,
  // in the form of indices into new_results
  var unmoved = [];
  // max_seq_len: length of LCS found so far
  var max_seq_len = 0;
  // seq_ends[i]: the index into new_results of the last doc in a
  // common subsequence of length of i+1 <= max_seq_len
  var N = new_results.length;
  var seq_ends = new Array(N);
  // ptrs:  the common subsequence ending with new_results[n] extends
  // a common subsequence ending with new_results[ptr[n]], unless
  // ptr[n] is -1.
  var ptrs = new Array(N);
  // virtual sequence of old indices of new results
  var old_idx_seq = function(i_new) {
    return old_index_of_id[new_results[i_new]._id];
  };
  // for each item in new_results, use it to extend a common subsequence
  // of length j <= max_seq_len
  for(var i=0; i<N; i++) {
    if (old_index_of_id[new_results[i]._id] !== undefined) {
      var j = max_seq_len;
      // this inner loop would traditionally be a binary search,
      // but scanning backwards we will likely find a subseq to extend
      // pretty soon, bounded for example by the total number of ops.
      // If this were to be changed to a binary search, we'd still want
      // to scan backwards a bit as an optimization.
      while (j > 0) {
        if (old_idx_seq(seq_ends[j-1]) < old_idx_seq(i))
          break;
        j--;
      }

      ptrs[i] = (j === 0 ? -1 : seq_ends[j-1]);
      seq_ends[j] = i;
      if (j+1 > max_seq_len)
        max_seq_len = j+1;
    }
  }

  // pull out the LCS/LIS into unmoved
  var idx = (max_seq_len === 0 ? -1 : seq_ends[max_seq_len-1]);
  while (idx >= 0) {
    unmoved.push(idx);
    idx = ptrs[idx];
  }
  // the unmoved item list is built backwards, so fix that
  unmoved.reverse();

  // the last group is always anchored by the end of the result list, which is
  // an id of "null"
  unmoved.push(new_results.length);

  _.each(old_results, function (doc) {
    if (!new_presence_of_id[doc._id])
      observer.removed && observer.removed(doc._id);
  });
  // for each group of things in the new_results that is anchored by an unmoved
  // element, iterate through the things before it.
  var startOfGroup = 0;
  _.each(unmoved, function (endOfGroup) {
    var groupId = new_results[endOfGroup] ? new_results[endOfGroup]._id : null;
    var oldDoc, newDoc, fields, projectedNew, projectedOld;
    for (var i = startOfGroup; i < endOfGroup; i++) {
      newDoc = new_results[i];
      if (!_.has(old_index_of_id, newDoc._id)) {
        fields = projectionFn(newDoc);
        delete fields._id;
        observer.addedBefore && observer.addedBefore(newDoc._id, fields, groupId);
        observer.added && observer.added(newDoc._id, fields);
      } else {
        // moved
        oldDoc = old_results[old_index_of_id[newDoc._id]];
        projectedNew = projectionFn(newDoc);
        projectedOld = projectionFn(oldDoc);
        fields = LocalCollection._makeChangedFields(projectedNew, projectedOld);
        if (!_.isEmpty(fields)) {
          observer.changed && observer.changed(newDoc._id, fields);
        }
        observer.movedBefore && observer.movedBefore(newDoc._id, groupId);
      }
    }
    if (groupId) {
      newDoc = new_results[endOfGroup];
      oldDoc = old_results[old_index_of_id[newDoc._id]];
      projectedNew = projectionFn(newDoc);
      projectedOld = projectionFn(oldDoc);
      fields = LocalCollection._makeChangedFields(projectedNew, projectedOld);
      if (!_.isEmpty(fields)) {
        observer.changed && observer.changed(newDoc._id, fields);
      }
    }
    startOfGroup = endOfGroup+1;
  });


};


// General helper for diff-ing two objects.
// callbacks is an object like so:
// { leftOnly: function (key, leftValue) {...},
//   rightOnly: function (key, rightValue) {...},
//   both: function (key, leftValue, rightValue) {...},
// }
LocalCollection._diffObjects = function (left, right, callbacks) {
  _.each(left, function (leftValue, key) {
    if (_.has(right, key))
      callbacks.both && callbacks.both(key, leftValue, right[key]);
    else
      callbacks.leftOnly && callbacks.leftOnly(key, leftValue);
  });
  if (callbacks.rightOnly) {
    _.each(right, function(rightValue, key) {
      if (!_.has(left, key))
        callbacks.rightOnly(key, rightValue);
    });
  }
};

},{}],2:[function(require,module,exports){
// Like _.isArray, but doesn't regard polyfilled Uint8Arrays on old browsers as
// arrays.
// XXX maybe this should be EJSON.isArray
isArray = function (x) {
  return _.isArray(x) && !EJSON.isBinary(x);
};

// XXX maybe this should be EJSON.isObject, though EJSON doesn't know about
// RegExp
// XXX note that _type(undefined) === 3!!!!
isPlainObject = LocalCollection._isPlainObject = function (x) {
  return x && LocalCollection._f._type(x) === 3;
};

isIndexable = function (x) {
  return isArray(x) || isPlainObject(x);
};

// Returns true if this is an object with at least one key and all keys begin
// with $.  Unless inconsistentOK is set, throws if some keys begin with $ and
// others don't.
isOperatorObject = function (valueSelector, inconsistentOK) {
  if (!isPlainObject(valueSelector))
    return false;

  var theseAreOperators = undefined;
  _.each(valueSelector, function (value, selKey) {
    var thisIsOperator = selKey.substr(0, 1) === '$';
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      if (!inconsistentOK)
        throw new Error("Inconsistent operator: " +
                        JSON.stringify(valueSelector));
      theseAreOperators = false;
    }
  });
  return !!theseAreOperators;  // {} has no operators
};


// string can be converted to integer
isNumericKey = function (s) {
  return /^[0-9]+$/.test(s);
};

},{}],3:[function(require,module,exports){
LocalCollection._IdMap = function () {
  var self = this;
  IdMap.call(self, LocalCollection._idStringify, LocalCollection._idParse);
};

Meteor._inherits(LocalCollection._IdMap, IdMap);


},{}],4:[function(require,module,exports){
// XXX type checking on selectors (graceful error if malformed)

// LocalCollection: a set of documents that supports queries and modifiers.

// Cursor: a specification for a particular subset of documents, w/
// a defined order, limit, and offset.  creating a Cursor with LocalCollection.find(),

// ObserveHandle: the return value of a live query.

LocalCollection = function (name) {
  var self = this;
  self.name = name;
  // _id -> document (also containing id)
  self._docs = new LocalCollection._IdMap;

  self._observeQueue = new Meteor._SynchronousQueue();

  self.next_qid = 1; // live query id generator

  // qid -> live query object. keys:
  //  ordered: bool. ordered queries have addedBefore/movedBefore callbacks.
  //  results: array (ordered) or object (unordered) of current results
  //    (aliased with self._docs!)
  //  resultsSnapshot: snapshot of results. null if not paused.
  //  cursor: Cursor object for the query.
  //  selector, sorter, (callbacks): functions
  self.queries = {};

  // null if not saving originals; an IdMap from id to original document value if
  // saving originals. See comments before saveOriginals().
  self._savedOriginals = null;

  // True when observers are paused and we should not send callbacks.
  self.paused = false;
};

Minimongo = {};

// Object exported only for unit testing.
// Use it to export private functions to test in Tinytest.
MinimongoTest = {};

LocalCollection._applyChanges = function (doc, changeFields) {
  _.each(changeFields, function (value, key) {
    if (value === undefined)
      delete doc[key];
    else
      doc[key] = value;
  });
};

MinimongoError = function (message) {
  var e = new Error(message);
  e.name = "MinimongoError";
  return e;
};


// options may include sort, skip, limit, reactive
// sort may be any of these forms:
//     {a: 1, b: -1}
//     [["a", "asc"], ["b", "desc"]]
//     ["a", ["b", "desc"]]
//   (in the first form you're beholden to key enumeration order in
//   your javascript VM)
//
// reactive: if given, and false, don't register with Tracker (default
// is true)
//
// XXX possibly should support retrieving a subset of fields? and
// have it be a hint (ignored on the client, when not copying the
// doc?)
//
// XXX sort does not yet support subkeys ('a.b') .. fix that!
// XXX add one more sort form: "key"
// XXX tests
LocalCollection.prototype.find = function (selector, options) {
  // default syntax for everything is to omit the selector argument.
  // but if selector is explicitly passed in as false or undefined, we
  // want a selector that matches nothing.
  if (arguments.length === 0)
    selector = {};

  return new LocalCollection.Cursor(this, selector, options);
};

// don't call this ctor directly.  use LocalCollection.find().

LocalCollection.Cursor = function (collection, selector, options) {
  var self = this;
  if (!options) options = {};

  self.collection = collection;
  self.sorter = null;

  if (LocalCollection._selectorIsId(selector)) {
    // stash for fast path
    self._selectorId = selector;
    self.matcher = new Minimongo.Matcher(selector);
  } else {
    self._selectorId = undefined;
    self.matcher = new Minimongo.Matcher(selector);
    if (self.matcher.hasGeoQuery() || options.sort) {
      self.sorter = new Minimongo.Sorter(options.sort || [],
                                         { matcher: self.matcher });
    }
  }
  self.skip = options.skip;
  self.limit = options.limit;
  self.fields = options.fields;

  self._projectionFn = LocalCollection._compileProjection(self.fields || {});

  self._transform = LocalCollection.wrapTransform(options.transform);

  // by default, queries register w/ Tracker when it is available.
  if (typeof Tracker !== "undefined")
    self.reactive = (options.reactive === undefined) ? true : options.reactive;
};

// Since we don't actually have a "nextObject" interface, there's really no
// reason to have a "rewind" interface.  All it did was make multiple calls
// to fetch/map/forEach return nothing the second time.
// XXX COMPAT WITH 0.8.1
LocalCollection.Cursor.prototype.rewind = function () {
};

LocalCollection.prototype.findOne = function (selector, options) {
  if (arguments.length === 0)
    selector = {};

  // NOTE: by setting limit 1 here, we end up using very inefficient
  // code that recomputes the whole query on each update. The upside is
  // that when you reactively depend on a findOne you only get
  // invalidated when the found object changes, not any object in the
  // collection. Most findOne will be by id, which has a fast path, so
  // this might not be a big deal. In most cases, invalidation causes
  // the called to re-query anyway, so this should be a net performance
  // improvement.
  options = options || {};
  options.limit = 1;

  return this.find(selector, options).fetch()[0];
};

/**
 * @callback IterationCallback
 * @param {Object} doc
 * @param {Number} index
 */
/**
 * @summary Call `callback` once for each matching document, sequentially and synchronously.
 * @locus Anywhere
 * @method  forEach
 * @instance
 * @memberOf Mongo.Cursor
 * @param {IterationCallback} callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
 * @param {Any} [thisArg] An object which will be the value of `this` inside `callback`.
 */
LocalCollection.Cursor.prototype.forEach = function (callback, thisArg) {
  var self = this;

  var objects = self._getRawObjects({ordered: true});

  if (self.reactive) {
    self._depend({
      addedBefore: true,
      removed: true,
      changed: true,
      movedBefore: true});
  }

  _.each(objects, function (elt, i) {
    // This doubles as a clone operation.
    elt = self._projectionFn(elt);

    if (self._transform)
      elt = self._transform(elt);
    callback.call(thisArg, elt, i, self);
  });
};

LocalCollection.Cursor.prototype.getTransform = function () {
  return this._transform;
};

/**
 * @summary Map callback over all matching documents.  Returns an Array.
 * @locus Anywhere
 * @method map
 * @instance
 * @memberOf Mongo.Cursor
 * @param {IterationCallback} callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
 * @param {Any} [thisArg] An object which will be the value of `this` inside `callback`.
 */
LocalCollection.Cursor.prototype.map = function (callback, thisArg) {
  var self = this;
  var res = [];
  self.forEach(function (doc, index) {
    res.push(callback.call(thisArg, doc, index, self));
  });
  return res;
};

/**
 * @summary Return all matching documents as an Array.
 * @memberOf Mongo.Cursor
 * @method  fetch
 * @instance
 * @locus Anywhere
 * @returns {Object[]}
 */
LocalCollection.Cursor.prototype.fetch = function () {
  var self = this;
  var res = [];
  self.forEach(function (doc) {
    res.push(doc);
  });
  return res;
};

/**
 * @summary Returns the number of documents that match a query.
 * @memberOf Mongo.Cursor
 * @method  count
 * @instance
 * @locus Anywhere
 * @returns {Number}
 */
LocalCollection.Cursor.prototype.count = function () {
  var self = this;

  if (self.reactive)
    self._depend({added: true, removed: true},
                 true /* allow the observe to be unordered */);

  return self._getRawObjects({ordered: true}).length;
};

LocalCollection.Cursor.prototype._publishCursor = function (sub) {
  var self = this;
  if (! self.collection.name)
    throw new Error("Can't publish a cursor from a collection without a name.");
  var collection = self.collection.name;

  // XXX minimongo should not depend on mongo-livedata!
  return Mongo.Collection._publishCursor(self, sub, collection);
};

LocalCollection.Cursor.prototype._getCollectionName = function () {
  var self = this;
  return self.collection.name;
};

LocalCollection._observeChangesCallbacksAreOrdered = function (callbacks) {
  if (callbacks.added && callbacks.addedBefore)
    throw new Error("Please specify only one of added() and addedBefore()");
  return !!(callbacks.addedBefore || callbacks.movedBefore);
};

LocalCollection._observeCallbacksAreOrdered = function (callbacks) {
  if (callbacks.addedAt && callbacks.added)
    throw new Error("Please specify only one of added() and addedAt()");
  if (callbacks.changedAt && callbacks.changed)
    throw new Error("Please specify only one of changed() and changedAt()");
  if (callbacks.removed && callbacks.removedAt)
    throw new Error("Please specify only one of removed() and removedAt()");

  return !!(callbacks.addedAt || callbacks.movedTo || callbacks.changedAt
            || callbacks.removedAt);
};

// the handle that comes back from observe.
LocalCollection.ObserveHandle = function () {};

// options to contain:
//  * callbacks for observe():
//    - addedAt (document, atIndex)
//    - added (document)
//    - changedAt (newDocument, oldDocument, atIndex)
//    - changed (newDocument, oldDocument)
//    - removedAt (document, atIndex)
//    - removed (document)
//    - movedTo (document, oldIndex, newIndex)
//
// attributes available on returned query handle:
//  * stop(): end updates
//  * collection: the collection this query is querying
//
// iff x is a returned query handle, (x instanceof
// LocalCollection.ObserveHandle) is true
//
// initial results delivered through added callback
// XXX maybe callbacks should take a list of objects, to expose transactions?
// XXX maybe support field limiting (to limit what you're notified on)

_.extend(LocalCollection.Cursor.prototype, {
  /**
   * @summary Watch a query.  Receive callbacks as the result set changes.
   * @locus Anywhere
   * @memberOf Mongo.Cursor
   * @instance
   * @param {Object} callbacks Functions to call to deliver the result set as it changes
   */
  observe: function (options) {
    var self = this;
    return LocalCollection._observeFromObserveChanges(self, options);
  },

  /**
   * @summary Watch a query.  Receive callbacks as the result set changes.  Only the differences between the old and new documents are passed to the callbacks.
   * @locus Anywhere
   * @memberOf Mongo.Cursor
   * @instance
   * @param {Object} callbacks Functions to call to deliver the result set as it changes
   */
  observeChanges: function (options) {
    var self = this;

    var ordered = LocalCollection._observeChangesCallbacksAreOrdered(options);

    // there are several places that assume you aren't combining skip/limit with
    // unordered observe.  eg, update's EJSON.clone, and the "there are several"
    // comment in _modifyAndNotify
    // XXX allow skip/limit with unordered observe
    if (!options._allow_unordered && !ordered && (self.skip || self.limit))
      throw new Error("must use ordered observe (ie, 'addedBefore' instead of 'added') with skip or limit");

    if (self.fields && (self.fields._id === 0 || self.fields._id === false))
      throw Error("You may not observe a cursor with {fields: {_id: 0}}");

    var query = {
      matcher: self.matcher, // not fast pathed
      sorter: ordered && self.sorter,
      distances: (
        self.matcher.hasGeoQuery() && ordered && new LocalCollection._IdMap),
      resultsSnapshot: null,
      ordered: ordered,
      cursor: self,
      projectionFn: self._projectionFn
    };
    var qid;

    // Non-reactive queries call added[Before] and then never call anything
    // else.
    if (self.reactive) {
      qid = self.collection.next_qid++;
      self.collection.queries[qid] = query;
    }
    query.results = self._getRawObjects({
      ordered: ordered, distances: query.distances});
    if (self.collection.paused)
      query.resultsSnapshot = (ordered ? [] : new LocalCollection._IdMap);

    // wrap callbacks we were passed. callbacks only fire when not paused and
    // are never undefined
    // Filters out blacklisted fields according to cursor's projection.
    // XXX wrong place for this?

    // furthermore, callbacks enqueue until the operation we're working on is
    // done.
    var wrapCallback = function (f) {
      if (!f)
        return function () {};
      return function (/*args*/) {
        var context = this;
        var args = arguments;

        if (self.collection.paused)
          return;

        self.collection._observeQueue.queueTask(function () {
          f.apply(context, args);
        });
      };
    };
    query.added = wrapCallback(options.added);
    query.changed = wrapCallback(options.changed);
    query.removed = wrapCallback(options.removed);
    if (ordered) {
      query.addedBefore = wrapCallback(options.addedBefore);
      query.movedBefore = wrapCallback(options.movedBefore);
    }

    if (!options._suppress_initial && !self.collection.paused) {
      // XXX unify ordered and unordered interface
      var each = ordered
            ? _.bind(_.each, null, query.results)
            : _.bind(query.results.forEach, query.results);
      each(function (doc) {
        var fields = EJSON.clone(doc);

        delete fields._id;
        if (ordered)
          query.addedBefore(doc._id, self._projectionFn(fields), null);
        query.added(doc._id, self._projectionFn(fields));
      });
    }

    var handle = new LocalCollection.ObserveHandle;
    _.extend(handle, {
      collection: self.collection,
      stop: function () {
        if (self.reactive)
          delete self.collection.queries[qid];
      }
    });

    if (self.reactive && Tracker.active) {
      // XXX in many cases, the same observe will be recreated when
      // the current autorun is rerun.  we could save work by
      // letting it linger across rerun and potentially get
      // repurposed if the same observe is performed, using logic
      // similar to that of Meteor.subscribe.
      Tracker.onInvalidate(function () {
        handle.stop();
      });
    }
    // run the observe callbacks resulting from the initial contents
    // before we leave the observe.
    self.collection._observeQueue.drain();

    return handle;
  }
});

// Returns a collection of matching objects, but doesn't deep copy them.
//
// If ordered is set, returns a sorted array, respecting sorter, skip, and limit
// properties of the query.  if sorter is falsey, no sort -- you get the natural
// order.
//
// If ordered is not set, returns an object mapping from ID to doc (sorter, skip
// and limit should not be set).
//
// If ordered is set and this cursor is a $near geoquery, then this function
// will use an _IdMap to track each distance from the $near argument point in
// order to use it as a sort key. If an _IdMap is passed in the 'distances'
// argument, this function will clear it and use it for this purpose (otherwise
// it will just create its own _IdMap). The observeChanges implementation uses
// this to remember the distances after this function returns.
LocalCollection.Cursor.prototype._getRawObjects = function (options) {
  var self = this;
  options = options || {};

  // XXX use OrderedDict instead of array, and make IdMap and OrderedDict
  // compatible
  var results = options.ordered ? [] : new LocalCollection._IdMap;

  // fast path for single ID value
  if (self._selectorId !== undefined) {
    // If you have non-zero skip and ask for a single id, you get
    // nothing. This is so it matches the behavior of the '{_id: foo}'
    // path.
    if (self.skip)
      return results;

    var selectedDoc = self.collection._docs.get(self._selectorId);
    if (selectedDoc) {
      if (options.ordered)
        results.push(selectedDoc);
      else
        results.set(self._selectorId, selectedDoc);
    }
    return results;
  }

  // slow path for arbitrary selector, sort, skip, limit

  // in the observeChanges case, distances is actually part of the "query" (ie,
  // live results set) object.  in other cases, distances is only used inside
  // this function.
  var distances;
  if (self.matcher.hasGeoQuery() && options.ordered) {
    if (options.distances) {
      distances = options.distances;
      distances.clear();
    } else {
      distances = new LocalCollection._IdMap();
    }
  }

  self.collection._docs.forEach(function (doc, id) {
    var matchResult = self.matcher.documentMatches(doc);
    if (matchResult.result) {
      if (options.ordered) {
        results.push(doc);
        if (distances && matchResult.distance !== undefined)
          distances.set(id, matchResult.distance);
      } else {
        results.set(id, doc);
      }
    }
    // Fast path for limited unsorted queries.
    // XXX 'length' check here seems wrong for ordered
    if (self.limit && !self.skip && !self.sorter &&
        results.length === self.limit)
      return false;  // break
    return true;  // continue
  });

  if (!options.ordered)
    return results;

  if (self.sorter) {
    var comparator = self.sorter.getComparator({distances: distances});
    results.sort(comparator);
  }

  var idx_start = self.skip || 0;
  var idx_end = self.limit ? (self.limit + idx_start) : results.length;
  return results.slice(idx_start, idx_end);
};

// XXX Maybe we need a version of observe that just calls a callback if
// anything changed.
LocalCollection.Cursor.prototype._depend = function (changers, _allow_unordered) {
  var self = this;

  if (Tracker.active) {
    var v = new Tracker.Dependency;
    v.depend();
    var notifyChange = _.bind(v.changed, v);

    var options = {
      _suppress_initial: true,
      _allow_unordered: _allow_unordered
    };
    _.each(['added', 'changed', 'removed', 'addedBefore', 'movedBefore'],
           function (fnName) {
             if (changers[fnName])
               options[fnName] = notifyChange;
           });

    // observeChanges will stop() when this computation is invalidated
    self.observeChanges(options);
  }
};

// XXX enforce rule that field names can't start with '$' or contain '.'
// (real mongodb does in fact enforce this)
// XXX possibly enforce that 'undefined' does not appear (we assume
// this in our handling of null and $exists)
LocalCollection.prototype.insert = function (doc, callback) {
  var self = this;
  doc = EJSON.clone(doc);

  if (!_.has(doc, '_id')) {
    // if you really want to use ObjectIDs, set this global.
    // Mongo.Collection specifies its own ids and does not use this code.
    doc._id = LocalCollection._useOID ? new LocalCollection._ObjectID()
                                      : Random.id();
  }
  var id = doc._id;

  if (self._docs.has(id))
    throw MinimongoError("Duplicate _id '" + id + "'");

  self._saveOriginal(id, undefined);
  self._docs.set(id, doc);

  var queriesToRecompute = [];
  // trigger live queries that match
  for (var qid in self.queries) {
    var query = self.queries[qid];
    var matchResult = query.matcher.documentMatches(doc);
    if (matchResult.result) {
      if (query.distances && matchResult.distance !== undefined)
        query.distances.set(id, matchResult.distance);
      if (query.cursor.skip || query.cursor.limit)
        queriesToRecompute.push(qid);
      else
        LocalCollection._insertInResults(query, doc);
    }
  }

  _.each(queriesToRecompute, function (qid) {
    if (self.queries[qid])
      self._recomputeResults(self.queries[qid]);
  });
  self._observeQueue.drain();

  // Defer because the caller likely doesn't expect the callback to be run
  // immediately.
  if (callback)
    Meteor.defer(function () {
      callback(null, id);
    });
  return id;
};

// Iterates over a subset of documents that could match selector; calls
// f(doc, id) on each of them.  Specifically, if selector specifies
// specific _id's, it only looks at those.  doc is *not* cloned: it is the
// same object that is in _docs.
LocalCollection.prototype._eachPossiblyMatchingDoc = function (selector, f) {
  var self = this;
  var specificIds = LocalCollection._idsMatchedBySelector(selector);
  if (specificIds) {
    for (var i = 0; i < specificIds.length; ++i) {
      var id = specificIds[i];
      var doc = self._docs.get(id);
      if (doc) {
        var breakIfFalse = f(doc, id);
        if (breakIfFalse === false)
          break;
      }
    }
  } else {
    self._docs.forEach(f);
  }
};

LocalCollection.prototype.remove = function (selector, callback) {
  var self = this;

  // Easy special case: if we're not calling observeChanges callbacks and we're
  // not saving originals and we got asked to remove everything, then just empty
  // everything directly.
  if (self.paused && !self._savedOriginals && EJSON.equals(selector, {})) {
    var result = self._docs.size();
    self._docs.clear();
    _.each(self.queries, function (query) {
      if (query.ordered) {
        query.results = [];
      } else {
        query.results.clear();
      }
    });
    if (callback) {
      Meteor.defer(function () {
        callback(null, result);
      });
    }
    return result;
  }

  var matcher = new Minimongo.Matcher(selector);
  var remove = [];
  self._eachPossiblyMatchingDoc(selector, function (doc, id) {
    if (matcher.documentMatches(doc).result)
      remove.push(id);
  });

  var queriesToRecompute = [];
  var queryRemove = [];
  for (var i = 0; i < remove.length; i++) {
    var removeId = remove[i];
    var removeDoc = self._docs.get(removeId);
    _.each(self.queries, function (query, qid) {
      if (query.matcher.documentMatches(removeDoc).result) {
        if (query.cursor.skip || query.cursor.limit)
          queriesToRecompute.push(qid);
        else
          queryRemove.push({qid: qid, doc: removeDoc});
      }
    });
    self._saveOriginal(removeId, removeDoc);
    self._docs.remove(removeId);
  }

  // run live query callbacks _after_ we've removed the documents.
  _.each(queryRemove, function (remove) {
    var query = self.queries[remove.qid];
    if (query) {
      query.distances && query.distances.remove(remove.doc._id);
      LocalCollection._removeFromResults(query, remove.doc);
    }
  });
  _.each(queriesToRecompute, function (qid) {
    var query = self.queries[qid];
    if (query)
      self._recomputeResults(query);
  });
  self._observeQueue.drain();
  result = remove.length;
  if (callback)
    Meteor.defer(function () {
      callback(null, result);
    });
  return result;
};

// XXX atomicity: if multi is true, and one modification fails, do
// we rollback the whole operation, or what?
LocalCollection.prototype.update = function (selector, mod, options, callback) {
  var self = this;
  if (! callback && options instanceof Function) {
    callback = options;
    options = null;
  }
  if (!options) options = {};

  var matcher = new Minimongo.Matcher(selector);

  // Save the original results of any query that we might need to
  // _recomputeResults on, because _modifyAndNotify will mutate the objects in
  // it. (We don't need to save the original results of paused queries because
  // they already have a resultsSnapshot and we won't be diffing in
  // _recomputeResults.)
  var qidToOriginalResults = {};
  _.each(self.queries, function (query, qid) {
    // XXX for now, skip/limit implies ordered observe, so query.results is
    // always an array
    if ((query.cursor.skip || query.cursor.limit) && ! self.paused)
      qidToOriginalResults[qid] = EJSON.clone(query.results);
  });
  var recomputeQids = {};

  var updateCount = 0;

  self._eachPossiblyMatchingDoc(selector, function (doc, id) {
    var queryResult = matcher.documentMatches(doc);
    if (queryResult.result) {
      // XXX Should we save the original even if mod ends up being a no-op?
      self._saveOriginal(id, doc);
      self._modifyAndNotify(doc, mod, recomputeQids, queryResult.arrayIndices);
      ++updateCount;
      if (!options.multi)
        return false;  // break
    }
    return true;
  });

  _.each(recomputeQids, function (dummy, qid) {
    var query = self.queries[qid];
    if (query)
      self._recomputeResults(query, qidToOriginalResults[qid]);
  });
  self._observeQueue.drain();

  // If we are doing an upsert, and we didn't modify any documents yet, then
  // it's time to do an insert. Figure out what document we are inserting, and
  // generate an id for it.
  var insertedId;
  if (updateCount === 0 && options.upsert) {
    var newDoc = LocalCollection._removeDollarOperators(selector);
    LocalCollection._modify(newDoc, mod, {isInsert: true});
    if (! newDoc._id && options.insertedId)
      newDoc._id = options.insertedId;
    insertedId = self.insert(newDoc);
    updateCount = 1;
  }

  // Return the number of affected documents, or in the upsert case, an object
  // containing the number of affected docs and the id of the doc that was
  // inserted, if any.
  var result;
  if (options._returnObject) {
    result = {
      numberAffected: updateCount
    };
    if (insertedId !== undefined)
      result.insertedId = insertedId;
  } else {
    result = updateCount;
  }

  if (callback)
    Meteor.defer(function () {
      callback(null, result);
    });
  return result;
};

// A convenience wrapper on update. LocalCollection.upsert(sel, mod) is
// equivalent to LocalCollection.update(sel, mod, { upsert: true, _returnObject:
// true }).
LocalCollection.prototype.upsert = function (selector, mod, options, callback) {
  var self = this;
  if (! callback && typeof options === "function") {
    callback = options;
    options = {};
  }
  return self.update(selector, mod, _.extend({}, options, {
    upsert: true,
    _returnObject: true
  }), callback);
};

LocalCollection.prototype._modifyAndNotify = function (
    doc, mod, recomputeQids, arrayIndices) {
  var self = this;

  var matched_before = {};
  for (var qid in self.queries) {
    var query = self.queries[qid];
    if (query.ordered) {
      matched_before[qid] = query.matcher.documentMatches(doc).result;
    } else {
      // Because we don't support skip or limit (yet) in unordered queries, we
      // can just do a direct lookup.
      matched_before[qid] = query.results.has(doc._id);
    }
  }

  var old_doc = EJSON.clone(doc);

  LocalCollection._modify(doc, mod, {arrayIndices: arrayIndices});

  for (qid in self.queries) {
    query = self.queries[qid];
    var before = matched_before[qid];
    var afterMatch = query.matcher.documentMatches(doc);
    var after = afterMatch.result;
    if (after && query.distances && afterMatch.distance !== undefined)
      query.distances.set(doc._id, afterMatch.distance);

    if (query.cursor.skip || query.cursor.limit) {
      // We need to recompute any query where the doc may have been in the
      // cursor's window either before or after the update. (Note that if skip
      // or limit is set, "before" and "after" being true do not necessarily
      // mean that the document is in the cursor's output after skip/limit is
      // applied... but if they are false, then the document definitely is NOT
      // in the output. So it's safe to skip recompute if neither before or
      // after are true.)
      if (before || after)
        recomputeQids[qid] = true;
    } else if (before && !after) {
      LocalCollection._removeFromResults(query, doc);
    } else if (!before && after) {
      LocalCollection._insertInResults(query, doc);
    } else if (before && after) {
      LocalCollection._updateInResults(query, doc, old_doc);
    }
  }
};

// XXX the sorted-query logic below is laughably inefficient. we'll
// need to come up with a better datastructure for this.
//
// XXX the logic for observing with a skip or a limit is even more
// laughably inefficient. we recompute the whole results every time!

LocalCollection._insertInResults = function (query, doc) {
  var fields = EJSON.clone(doc);
  delete fields._id;
  if (query.ordered) {
    if (!query.sorter) {
      query.addedBefore(doc._id, query.projectionFn(fields), null);
      query.results.push(doc);
    } else {
      var i = LocalCollection._insertInSortedList(
        query.sorter.getComparator({distances: query.distances}),
        query.results, doc);
      var next = query.results[i+1];
      if (next)
        next = next._id;
      else
        next = null;
      query.addedBefore(doc._id, query.projectionFn(fields), next);
    }
    query.added(doc._id, query.projectionFn(fields));
  } else {
    query.added(doc._id, query.projectionFn(fields));
    query.results.set(doc._id, doc);
  }
};

LocalCollection._removeFromResults = function (query, doc) {
  if (query.ordered) {
    var i = LocalCollection._findInOrderedResults(query, doc);
    query.removed(doc._id);
    query.results.splice(i, 1);
  } else {
    var id = doc._id;  // in case callback mutates doc
    query.removed(doc._id);
    query.results.remove(id);
  }
};

LocalCollection._updateInResults = function (query, doc, old_doc) {
  if (!EJSON.equals(doc._id, old_doc._id))
    throw new Error("Can't change a doc's _id while updating");
  var projectionFn = query.projectionFn;
  var changedFields = LocalCollection._makeChangedFields(
    projectionFn(doc), projectionFn(old_doc));

  if (!query.ordered) {
    if (!_.isEmpty(changedFields)) {
      query.changed(doc._id, changedFields);
      query.results.set(doc._id, doc);
    }
    return;
  }

  var orig_idx = LocalCollection._findInOrderedResults(query, doc);

  if (!_.isEmpty(changedFields))
    query.changed(doc._id, changedFields);
  if (!query.sorter)
    return;

  // just take it out and put it back in again, and see if the index
  // changes
  query.results.splice(orig_idx, 1);
  var new_idx = LocalCollection._insertInSortedList(
    query.sorter.getComparator({distances: query.distances}),
    query.results, doc);
  if (orig_idx !== new_idx) {
    var next = query.results[new_idx+1];
    if (next)
      next = next._id;
    else
      next = null;
    query.movedBefore && query.movedBefore(doc._id, next);
  }
};

// Recomputes the results of a query and runs observe callbacks for the
// difference between the previous results and the current results (unless
// paused). Used for skip/limit queries.
//
// When this is used by insert or remove, it can just use query.results for the
// old results (and there's no need to pass in oldResults), because these
// operations don't mutate the documents in the collection. Update needs to pass
// in an oldResults which was deep-copied before the modifier was applied.
//
// oldResults is guaranteed to be ignored if the query is not paused.
LocalCollection.prototype._recomputeResults = function (query, oldResults) {
  var self = this;
  if (! self.paused && ! oldResults)
    oldResults = query.results;
  if (query.distances)
    query.distances.clear();
  query.results = query.cursor._getRawObjects({
    ordered: query.ordered, distances: query.distances});

  if (! self.paused) {
    LocalCollection._diffQueryChanges(
      query.ordered, oldResults, query.results, query,
      { projectionFn: query.projectionFn });
  }
};


LocalCollection._findInOrderedResults = function (query, doc) {
  if (!query.ordered)
    throw new Error("Can't call _findInOrderedResults on unordered query");
  for (var i = 0; i < query.results.length; i++)
    if (query.results[i] === doc)
      return i;
  throw Error("object missing from query");
};

// This binary search puts a value between any equal values, and the first
// lesser value.
LocalCollection._binarySearch = function (cmp, array, value) {
  var first = 0, rangeLength = array.length;

  while (rangeLength > 0) {
    var halfRange = Math.floor(rangeLength/2);
    if (cmp(value, array[first + halfRange]) >= 0) {
      first += halfRange + 1;
      rangeLength -= halfRange + 1;
    } else {
      rangeLength = halfRange;
    }
  }
  return first;
};

LocalCollection._insertInSortedList = function (cmp, array, value) {
  if (array.length === 0) {
    array.push(value);
    return 0;
  }

  var idx = LocalCollection._binarySearch(cmp, array, value);
  array.splice(idx, 0, value);
  return idx;
};

// To track what documents are affected by a piece of code, call saveOriginals()
// before it and retrieveOriginals() after it. retrieveOriginals returns an
// object whose keys are the ids of the documents that were affected since the
// call to saveOriginals(), and the values are equal to the document's contents
// at the time of saveOriginals. (In the case of an inserted document, undefined
// is the value.) You must alternate between calls to saveOriginals() and
// retrieveOriginals().
LocalCollection.prototype.saveOriginals = function () {
  var self = this;
  if (self._savedOriginals)
    throw new Error("Called saveOriginals twice without retrieveOriginals");
  self._savedOriginals = new LocalCollection._IdMap;
};
LocalCollection.prototype.retrieveOriginals = function () {
  var self = this;
  if (!self._savedOriginals)
    throw new Error("Called retrieveOriginals without saveOriginals");

  var originals = self._savedOriginals;
  self._savedOriginals = null;
  return originals;
};

LocalCollection.prototype._saveOriginal = function (id, doc) {
  var self = this;
  // Are we even trying to save originals?
  if (!self._savedOriginals)
    return;
  // Have we previously mutated the original (and so 'doc' is not actually
  // original)?  (Note the 'has' check rather than truth: we store undefined
  // here for inserted docs!)
  if (self._savedOriginals.has(id))
    return;
  self._savedOriginals.set(id, EJSON.clone(doc));
};

// Pause the observers. No callbacks from observers will fire until
// 'resumeObservers' is called.
LocalCollection.prototype.pauseObservers = function () {
  // No-op if already paused.
  if (this.paused)
    return;

  // Set the 'paused' flag such that new observer messages don't fire.
  this.paused = true;

  // Take a snapshot of the query results for each query.
  for (var qid in this.queries) {
    var query = this.queries[qid];

    query.resultsSnapshot = EJSON.clone(query.results);
  }
};

// Resume the observers. Observers immediately receive change
// notifications to bring them to the current state of the
// database. Note that this is not just replaying all the changes that
// happened during the pause, it is a smarter 'coalesced' diff.
LocalCollection.prototype.resumeObservers = function () {
  var self = this;
  // No-op if not paused.
  if (!this.paused)
    return;

  // Unset the 'paused' flag. Make sure to do this first, otherwise
  // observer methods won't actually fire when we trigger them.
  this.paused = false;

  for (var qid in this.queries) {
    var query = self.queries[qid];
    // Diff the current results against the snapshot and send to observers.
    // pass the query object for its observer callbacks.
    LocalCollection._diffQueryChanges(
      query.ordered, query.resultsSnapshot, query.results, query,
      { projectionFn: query.projectionFn });
    query.resultsSnapshot = null;
  }
  self._observeQueue.drain();
};


// NB: used by livedata
LocalCollection._idStringify = function (id) {
  if (id instanceof LocalCollection._ObjectID) {
    return id.valueOf();
  } else if (typeof id === 'string') {
    if (id === "") {
      return id;
    } else if (id.substr(0, 1) === "-" || // escape previously dashed strings
               id.substr(0, 1) === "~" || // escape escaped numbers, true, false
               LocalCollection._looksLikeObjectID(id) || // escape object-id-form strings
               id.substr(0, 1) === '{') { // escape object-form strings, for maybe implementing later
      return "-" + id;
    } else {
      return id; // other strings go through unchanged.
    }
  } else if (id === undefined) {
    return '-';
  } else if (typeof id === 'object' && id !== null) {
    throw new Error("Meteor does not currently support objects other than ObjectID as ids");
  } else { // Numbers, true, false, null
    return "~" + JSON.stringify(id);
  }
};


// NB: used by livedata
LocalCollection._idParse = function (id) {
  if (id === "") {
    return id;
  } else if (id === '-') {
    return undefined;
  } else if (id.substr(0, 1) === '-') {
    return id.substr(1);
  } else if (id.substr(0, 1) === '~') {
    return JSON.parse(id.substr(1));
  } else if (LocalCollection._looksLikeObjectID(id)) {
    return new LocalCollection._ObjectID(id);
  } else {
    return id;
  }
};

LocalCollection._makeChangedFields = function (newDoc, oldDoc) {
  var fields = {};
  LocalCollection._diffObjects(oldDoc, newDoc, {
    leftOnly: function (key, value) {
      fields[key] = undefined;
    },
    rightOnly: function (key, value) {
      fields[key] = value;
    },
    both: function (key, leftValue, rightValue) {
      if (!EJSON.equals(leftValue, rightValue))
        fields[key] = rightValue;
    }
  });
  return fields;
};

},{}],5:[function(require,module,exports){
Tinytest.add("minimongo - modifier affects selector", function (test) {
  function testSelectorPaths (sel, paths, desc) {
    var matcher = new Minimongo.Matcher(sel);
    test.equal(matcher._getPaths(), paths, desc);
  }

  testSelectorPaths({
    foo: {
      bar: 3,
      baz: 42
    }
  }, ['foo'], "literal");

  testSelectorPaths({
    foo: 42,
    bar: 33
  }, ['foo', 'bar'], "literal");

  testSelectorPaths({
    foo: [ 'something' ],
    bar: "asdf"
  }, ['foo', 'bar'], "literal");

  testSelectorPaths({
    a: { $lt: 3 },
    b: "you know, literal",
    'path.is.complicated': { $not: { $regex: 'acme.*corp' } }
  }, ['a', 'b', 'path.is.complicated'], "literal + operators");

  testSelectorPaths({
    $or: [{ 'a.b': 1 }, { 'a.b.c': { $lt: 22 } },
     {$and: [{ 'x.d': { $ne: 5, $gte: 433 } }, { 'a.b': 234 }]}]
  }, ['a.b', 'a.b.c', 'x.d'], 'group operators + duplicates');

  // When top-level value is an object, it is treated as a literal,
  // so when you query col.find({ a: { foo: 1, bar: 2 } })
  // it doesn't mean you are looking for anything that has 'a.foo' to be 1 and
  // 'a.bar' to be 2, instead you are looking for 'a' to be exatly that object
  // with exatly that order of keys. { a: { foo: 1, bar: 2, baz: 3 } } wouldn't
  // match it. That's why in this selector 'a' would be important key, not a.foo
  // and a.bar.
  testSelectorPaths({
    a: {
      foo: 1,
      bar: 2
    },
    'b.c': {
      literal: "object",
      but: "we still observe any changes in 'b.c'"
    }
  }, ['a', 'b.c'], "literal object");

  // Note that a and b do NOT end up in the path list, but x and y both do.
  testSelectorPaths({
    $or: [
      {x: {$elemMatch: {a: 5}}},
      {y: {$elemMatch: {b: 7}}}
    ]
  }, ['x', 'y'], "$or and elemMatch");

  function testSelectorAffectedByModifier (sel, mod, yes, desc) {
    var matcher = new Minimongo.Matcher(sel);
    test.equal(matcher.affectedByModifier(mod), yes, desc);
  }

  function affected(sel, mod, desc) {
    testSelectorAffectedByModifier(sel, mod, true, desc);
  }
  function notAffected(sel, mod, desc) {
    testSelectorAffectedByModifier(sel, mod, false, desc);
  }

  notAffected({ foo: 0 }, { $set: { bar: 1 } }, "simplest");
  affected({ foo: 0 }, { $set: { foo: 1 } }, "simplest");
  affected({ foo: 0 }, { $set: { 'foo.bar': 1 } }, "simplest");
  notAffected({ 'foo.bar': 0 }, { $set: { 'foo.baz': 1 } }, "simplest");
  affected({ 'foo.bar': 0 }, { $set: { 'foo.1': 1 } }, "simplest");
  affected({ 'foo.bar': 0 }, { $set: { 'foo.2.bar': 1 } }, "simplest");

  notAffected({ 'foo': 0 }, { $set: { 'foobaz': 1 } }, "correct prefix check");
  notAffected({ 'foobar': 0 }, { $unset: { 'foo': 1 } }, "correct prefix check");
  notAffected({ 'foo.bar': 0 }, { $unset: { 'foob': 1 } }, "correct prefix check");

  notAffected({ 'foo.Infinity.x': 0 }, { $unset: { 'foo.x': 1 } }, "we convert integer fields correctly");
  notAffected({ 'foo.1e3.x': 0 }, { $unset: { 'foo.x': 1 } }, "we convert integer fields correctly");

  affected({ 'foo.3.bar': 0 }, { $set: { 'foo.3.bar': 1 } }, "observe for an array element");

  notAffected({ 'foo.4.bar.baz': 0 }, { $unset: { 'foo.3.bar': 1 } }, "delicate work with numeric fields in selector");
  notAffected({ 'foo.4.bar.baz': 0 }, { $unset: { 'foo.bar': 1 } }, "delicate work with numeric fields in selector");
  affected({ 'foo.4.bar.baz': 0 }, { $unset: { 'foo.4.bar': 1 } }, "delicate work with numeric fields in selector");
  affected({ 'foo.bar.baz': 0 }, { $unset: { 'foo.3.bar': 1 } }, "delicate work with numeric fields in selector");

  affected({ 'foo.0.bar': 0 }, { $set: { 'foo.0.0.bar': 1 } }, "delicate work with nested arrays and selectors by indecies");

  affected({foo: {$elemMatch: {bar: 5}}}, {$set: {'foo.4.bar': 5}}, "$elemMatch");
});

Tinytest.add("minimongo - selector and projection combination", function (test) {
  function testSelProjectionComb (sel, proj, expected, desc) {
    var matcher = new Minimongo.Matcher(sel);
    test.equal(matcher.combineIntoProjection(proj), expected, desc);
  }

  // Test with inclusive projection
  testSelProjectionComb({ a: 1, b: 2 }, { b: 1, c: 1, d: 1 }, { a: true, b: true, c: true, d: true }, "simplest incl");
  testSelProjectionComb({ $or: [{ a: 1234, e: {$lt: 5} }], b: 2 }, { b: 1, c: 1, d: 1 }, { a: true, b: true, c: true, d: true, e: true }, "simplest incl, branching");
  testSelProjectionComb({
    'a.b': { $lt: 3 },
    'y.0': -1,
    'a.c': 15
  }, {
    'd': 1,
    'z': 1
  }, {
    'a.b': true,
    'y': true,
    'a.c': true,
    'd': true,
    'z': true
  }, "multikey paths in selector - incl");

  testSelProjectionComb({
    foo: 1234,
    $and: [{ k: -1 }, { $or: [{ b: 15 }] }]
  }, {
    'foo.bar': 1,
    'foo.zzz': 1,
    'b.asdf': 1
  }, {
    foo: true,
    b: true,
    k: true
  }, "multikey paths in fields - incl");

  testSelProjectionComb({
    'a.b.c': 123,
    'a.b.d': 321,
    'b.c.0': 111,
    'a.e': 12345
  }, {
    'a.b.z': 1,
    'a.b.d.g': 1,
    'c.c.c': 1
  }, {
    'a.b.c': true,
    'a.b.d': true,
    'a.b.z': true,
    'b.c': true,
    'a.e': true,
    'c.c.c': true
  }, "multikey both paths - incl");

  testSelProjectionComb({
    'a.b.c.d': 123,
    'a.b1.c.d': 421,
    'a.b.c.e': 111
  }, {
    'a.b': 1
  }, {
    'a.b': true,
    'a.b1.c.d': true
  }, "shadowing one another - incl");

  testSelProjectionComb({
    'a.b': 123,
    'foo.bar': false
  }, {
    'a.b.c.d': 1,
    'foo': 1
  }, {
    'a.b': true,
    'foo': true
  }, "shadowing one another - incl");

  testSelProjectionComb({
    'a.b.c': 1
  }, {
    'a.b.c': 1
  }, {
    'a.b.c': true
  }, "same paths - incl");

  testSelProjectionComb({
    'x.4.y': 42,
    'z.0.1': 33
  }, {
    'x.x': 1
  }, {
    'x.x': true,
    'x.y': true,
    'z': true
  }, "numbered keys in selector - incl");

  testSelProjectionComb({
    'a.b.c': 42,
    $where: function () { return true; }
  }, {
    'a.b': 1,
    'z.z': 1
  }, {}, "$where in the selector - incl");

  testSelProjectionComb({
    $or: [
      {'a.b.c': 42},
      {$where: function () { return true; } }
    ]
  }, {
    'a.b': 1,
    'z.z': 1
  }, {}, "$where in the selector - incl");

  // Test with exclusive projection
  testSelProjectionComb({ a: 1, b: 2 }, { b: 0, c: 0, d: 0 }, { c: false, d: false }, "simplest excl");
  testSelProjectionComb({ $or: [{ a: 1234, e: {$lt: 5} }], b: 2 }, { b: 0, c: 0, d: 0 }, { c: false, d: false }, "simplest excl, branching");
  testSelProjectionComb({
    'a.b': { $lt: 3 },
    'y.0': -1,
    'a.c': 15
  }, {
    'd': 0,
    'z': 0
  }, {
    d: false,
    z: false
  }, "multikey paths in selector - excl");

  testSelProjectionComb({
    foo: 1234,
    $and: [{ k: -1 }, { $or: [{ b: 15 }] }]
  }, {
    'foo.bar': 0,
    'foo.zzz': 0,
    'b.asdf': 0
  }, {
  }, "multikey paths in fields - excl");

  testSelProjectionComb({
    'a.b.c': 123,
    'a.b.d': 321,
    'b.c.0': 111,
    'a.e': 12345
  }, {
    'a.b.z': 0,
    'a.b.d.g': 0,
    'c.c.c': 0
  }, {
    'a.b.z': false,
    'c.c.c': false
  }, "multikey both paths - excl");

  testSelProjectionComb({
    'a.b.c.d': 123,
    'a.b1.c.d': 421,
    'a.b.c.e': 111
  }, {
    'a.b': 0
  }, {
  }, "shadowing one another - excl");

  testSelProjectionComb({
    'a.b': 123,
    'foo.bar': false
  }, {
    'a.b.c.d': 0,
    'foo': 0
  }, {
  }, "shadowing one another - excl");

  testSelProjectionComb({
    'a.b.c': 1
  }, {
    'a.b.c': 0
  }, {
  }, "same paths - excl");

  testSelProjectionComb({
    'a.b': 123,
    'a.c.d': 222,
    'ddd': 123
  }, {
    'a.b': 0,
    'a.c.e': 0,
    'asdf': 0
  }, {
    'a.c.e': false,
    'asdf': false
  }, "intercept the selector path - excl");

  testSelProjectionComb({
    'a.b.c': 14
  }, {
    'a.b.d': 0
  }, {
    'a.b.d': false
  }, "different branches - excl");

  testSelProjectionComb({
    'a.b.c.d': "124",
    'foo.bar.baz.que': "some value"
  }, {
    'a.b.c.d.e': 0,
    'foo.bar': 0
  }, {
  }, "excl on incl paths - excl");

  testSelProjectionComb({
    'x.4.y': 42,
    'z.0.1': 33
  }, {
    'x.x': 0,
    'x.y': 0
  }, {
    'x.x': false,
  }, "numbered keys in selector - excl");

  testSelProjectionComb({
    'a.b.c': 42,
    $where: function () { return true; }
  }, {
    'a.b': 0,
    'z.z': 0
  }, {}, "$where in the selector - excl");

  testSelProjectionComb({
    $or: [
      {'a.b.c': 42},
      {$where: function () { return true; } }
    ]
  }, {
    'a.b': 0,
    'z.z': 0
  }, {}, "$where in the selector - excl");

});

Tinytest.add("minimongo - sorter and projection combination", function (test) {
  function testSorterProjectionComb (sortSpec, proj, expected, desc) {
    var sorter = new Minimongo.Sorter(sortSpec);
    test.equal(sorter.combineIntoProjection(proj), expected, desc);
  }

  // Test with inclusive projection
  testSorterProjectionComb({ a: 1, b: 1 }, { b: 1, c: 1, d: 1 }, { a: true, b: true, c: true, d: true }, "simplest incl");
  testSorterProjectionComb({ a: 1, b: -1 }, { b: 1, c: 1, d: 1 }, { a: true, b: true, c: true, d: true }, "simplest incl");
  testSorterProjectionComb({ 'a.c': 1 }, { b: 1 }, { 'a.c': true, b: true }, "dot path incl");
  testSorterProjectionComb({ 'a.1.c': 1 }, { b: 1 }, { 'a.c': true, b: true }, "dot num path incl");
  testSorterProjectionComb({ 'a.1.c': 1 }, { b: 1, a: 1 }, { a: true, b: true }, "dot num path incl overlap");
  testSorterProjectionComb({ 'a.1.c': 1, 'a.2.b': -1 }, { b: 1 }, { 'a.c': true, 'a.b': true, b: true }, "dot num path incl");
  testSorterProjectionComb({ 'a.1.c': 1, 'a.2.b': -1 }, {}, {}, "dot num path with empty incl");

  // Test with exclusive projection
  testSorterProjectionComb({ a: 1, b: 1 }, { b: 0, c: 0, d: 0 }, { c: false, d: false }, "simplest excl");
  testSorterProjectionComb({ a: 1, b: -1 }, { b: 0, c: 0, d: 0 }, { c: false, d: false }, "simplest excl");
  testSorterProjectionComb({ 'a.c': 1 }, { b: 0 }, { b: false }, "dot path excl");
  testSorterProjectionComb({ 'a.1.c': 1 }, { b: 0 }, { b: false }, "dot num path excl");
  testSorterProjectionComb({ 'a.1.c': 1 }, { b: 0, a: 0 }, { b: false }, "dot num path excl overlap");
  testSorterProjectionComb({ 'a.1.c': 1, 'a.2.b': -1 }, { b: 0 }, { b: false }, "dot num path excl");
});


(function () {
  // TODO: Tests for "can selector become true by modifier" are incomplete,
  // absent or test the functionality of "not ideal" implementation (test checks
  // that certain case always returns true as implementation is incomplete)
  // - tests with $and/$or/$nor/$not branches (are absent)
  // - more tests with arrays fields and numeric keys (incomplete and test "not
  // ideal" implementation)
  // - tests when numeric keys actually mean numeric keys, not array indexes
  // (are absent)
  // - tests with $-operators in the selector (are incomplete and test "not
  // ideal" implementation)
  //  * gives up on $-operators with non-scalar values ({$ne: {x: 1}})
  //  * analyses $in
  //  * analyses $nin/$ne
  //  * analyses $gt, $gte, $lt, $lte
  //  * gives up on a combination of $gt/$gte/$lt/$lte and $ne/$nin
  //  * doesn't support $eq properly

  var test = null; // set this global in the beginning of every test
  // T - should return true
  // F - should return false
  var oneTest = function (sel, mod, expected, desc) {
    var matcher = new Minimongo.Matcher(sel);
    test.equal(matcher.canBecomeTrueByModifier(mod), expected, desc);
  };
  function T (sel, mod, desc) {
    oneTest(sel, mod, true, desc);
  }
  function F (sel, mod, desc) {
    oneTest(sel, mod, false, desc);
  }

  Tinytest.add("minimongo - can selector become true by modifier - literals (structured tests)", function (t) {
    test = t;

    var selector = {
      'a.b.c': 2,
      'foo.bar': {
        z: { y: 1 }
      },
      'foo.baz': [ {ans: 42}, "string", false, undefined ],
      'empty.field': null
    };

    T(selector, {$set:{ 'a.b.c': 2 }});
    F(selector, {$unset:{ 'a': 1 }});
    F(selector, {$unset:{ 'a.b': 1 }});
    F(selector, {$unset:{ 'a.b.c': 1 }});
    T(selector, {$set:{ 'a.b': { c: 2 } }});
    F(selector, {$set:{ 'a.b': {} }});
    T(selector, {$set:{ 'a.b': { c: 2, x: 5 } }});
    F(selector, {$set:{ 'a.b.c.k': 3 }});
    F(selector, {$set:{ 'a.b.c.k': {} }});

    F(selector, {$unset:{ 'foo': 1 }});
    F(selector, {$unset:{ 'foo.bar': 1 }});
    F(selector, {$unset:{ 'foo.bar.z': 1 }});
    F(selector, {$unset:{ 'foo.bar.z.y': 1 }});
    F(selector, {$set:{ 'foo.bar.x': 1 }});
    F(selector, {$set:{ 'foo.bar': {} }});
    F(selector, {$set:{ 'foo.bar': 3 }});
    T(selector, {$set:{ 'foo.bar': { z: { y: 1 } } }});
    T(selector, {$set:{ 'foo.bar.z': { y: 1 } }});
    T(selector, {$set:{ 'foo.bar.z.y': 1 }});

    F(selector, {$set:{ 'empty.field': {} }});
    T(selector, {$set:{ 'empty': {} }});
    T(selector, {$set:{ 'empty.field': null }});
    T(selector, {$set:{ 'empty.field': undefined }});
    F(selector, {$set:{ 'empty.field.a': 3 }});
  });

  Tinytest.add("minimongo - can selector become true by modifier - literals (adhoc tests)", function (t) {
    test = t;
    T({x:1}, {$set:{x:1}}, "simple set scalar");
    T({x:"a"}, {$set:{x:"a"}}, "simple set scalar");
    T({x:false}, {$set:{x:false}}, "simple set scalar");
    F({x:true}, {$set:{x:false}}, "simple set scalar");
    F({x:2}, {$set:{x:3}}, "simple set scalar");

    F({'foo.bar.baz': 1, x:1}, {$unset:{'foo.bar.baz': 1}, $set:{x:1}}, "simple unset of the interesting path");
    F({'foo.bar.baz': 1, x:1}, {$unset:{'foo.bar': 1}, $set:{x:1}}, "simple unset of the interesting path prefix");
    F({'foo.bar.baz': 1, x:1}, {$unset:{'foo': 1}, $set:{x:1}}, "simple unset of the interesting path prefix");
    F({'foo.bar.baz': 1}, {$unset:{'foo.baz': 1}}, "simple unset of the interesting path prefix");
    F({'foo.bar.baz': 1}, {$unset:{'foo.bar.bar': 1}}, "simple unset of the interesting path prefix");
  });

  Tinytest.add("minimongo - can selector become true by modifier - regexps", function (t) {
    test = t;

    // Regexp
    T({ 'foo.bar': /^[0-9]+$/i }, { $set: {'foo.bar': '01233'} }, "set of regexp");
    // XXX this test should be False, should be fixed within improved implementation
    T({ 'foo.bar': /^[0-9]+$/i, x: 1 }, { $set: {'foo.bar': '0a1233', x: 1} }, "set of regexp");
    // XXX this test should be False, should be fixed within improved implementation
    T({ 'foo.bar': /^[0-9]+$/i, x: 1 }, { $unset: {'foo.bar': 1}, $set: { x: 1 } }, "unset of regexp");
    T({ 'foo.bar': /^[0-9]+$/i, x: 1 }, { $set: { x: 1 } }, "don't touch regexp");
  });

  Tinytest.add("minimongo - can selector become true by modifier - undefined/null", function (t) {
    test = t;
    // Nulls / Undefined
    T({ 'foo.bar': null }, {$set:{'foo.bar': null}}, "set of null looking for null");
    T({ 'foo.bar': null }, {$set:{'foo.bar': undefined}}, "set of undefined looking for null");
    T({ 'foo.bar': undefined }, {$set:{'foo.bar': null}}, "set of null looking for undefined");
    T({ 'foo.bar': undefined }, {$set:{'foo.bar': undefined}}, "set of undefined looking for undefined");
    T({ 'foo.bar': null }, {$set:{'foo': null}}, "set of null of parent path looking for null");
    F({ 'foo.bar': null }, {$set:{'foo.bar.baz': null}}, "set of null of different path looking for null");
    T({ 'foo.bar': null }, { $unset: { 'foo': 1 } }, "unset the parent");
    T({ 'foo.bar': null }, { $unset: { 'foo.bar': 1 } }, "unset tracked path");
    T({ 'foo.bar': null }, { $set: { 'foo': 3 } }, "set the parent");
    T({ 'foo.bar': null }, { $set: { 'foo': {baz:1} } }, "set the parent");

  });

  Tinytest.add("minimongo - can selector become true by modifier - literals with arrays", function (t) {
    test = t;
    // These tests are incomplete and in theory they all should return true as we
    // don't support any case with numeric fields yet.
    T({'a.1.b': 1, x:1}, {$unset:{'a.1.b': 1}, $set:{x:1}}, "unset of array element's field with exactly the same index as selector");
    F({'a.2.b': 1}, {$unset:{'a.1.b': 1}}, "unset of array element's field with different index as selector");
    // This is false, because if you are looking for array but in reality it is an
    // object, it just can't get to true.
    F({'a.2.b': 1}, {$unset:{'a.b': 1}}, "unset of field while selector is looking for index");
    T({ 'foo.bar': null }, {$set:{'foo.1.bar': null}}, "set array's element's field to null looking for null");
    T({ 'foo.bar': null }, {$set:{'foo.0.bar': 1, 'foo.1.bar': null}}, "set array's element's field to null looking for null");
    // This is false, because there may remain other array elements that match
    // but we modified this test as we don't support this case yet
    T({'a.b': 1}, {$unset:{'a.1.b': 1}}, "unset of array element's field");
  });

  Tinytest.add("minimongo - can selector become true by modifier - set an object literal whose fields are selected", function (t) {
    test = t;
    T({ 'a.b.c': 1 }, { $set: { 'a.b': { c: 1 } } }, "a simple scalar selector and simple set");
    F({ 'a.b.c': 1 }, { $set: { 'a.b': { c: 2 } } }, "a simple scalar selector and simple set to false");
    F({ 'a.b.c': 1 }, { $set: { 'a.b': { d: 1 } } }, "a simple scalar selector and simple set a wrong literal");
    F({ 'a.b.c': 1 }, { $set: { 'a.b': 222 } }, "a simple scalar selector and simple set a wrong type");
  });

  Tinytest.add("minimongo - can selector become true by modifier - $-scalar selectors and simple tests", function (t) {
    test = t;
    T({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { c: 4 } } }, "nested $lt");
    F({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { c: 5 } } }, "nested $lt");
    F({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { c: 6 } } }, "nested $lt");
    F({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b.d': 7 } }, "nested $lt, the change doesn't matter");
    F({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { d: 7 } } }, "nested $lt, the key disappears");
    T({ 'a.b.c': { $lt: 5 } }, { $set: { 'a.b': { d: 7, c: -1 } } }, "nested $lt");
    F({ a: { $lt: 10, $gt: 3 } }, { $unset: { a: 1 } }, "unset $lt");
    T({ a: { $lt: 10, $gt: 3 } }, { $set: { a: 4 } }, "set between x and y");
    F({ a: { $lt: 10, $gt: 3 } }, { $set: { a: 3 } }, "set between x and y");
    F({ a: { $lt: 10, $gt: 3 } }, { $set: { a: 10 } }, "set between x and y");
    F({ a: { $gt: 10, $lt: 3 } }, { $set: { a: 9 } }, "impossible statement");
    T({ a: { $lte: 10, $gte: 3 } }, { $set: { a: 3 } }, "set between x and y");
    T({ a: { $lte: 10, $gte: 3 } }, { $set: { a: 10 } }, "set between x and y");
    F({ a: { $lte: 10, $gte: 3 } }, { $set: { a: -10 } }, "set between x and y");
    T({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 } }, { $set: { a: 4 } }, "set between x and y");
    F({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 } }, { $set: { a: 3 } }, "set between x and y");
    F({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 } }, { $set: { a: 10 } }, "set between x and y");
    F({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 } }, { $set: { a: Infinity } }, "set between x and y");
    T({ a: { $lte: 10, $gte: 3, $gt: 3, $lt: 10 }, x: 1 }, { $set: { x: 1 } }, "set between x and y - dummy");
    F({ a: { $lte: 10, $gte: 13, $gt: 3, $lt: 9 }, x: 1 }, { $set: { x: 1 } }, "set between x and y - dummy - impossible");
    F({ a: { $lte: 10 } }, { $set: { a: Infinity } }, "Infinity <= 10?");
    T({ a: { $lte: 10 } }, { $set: { a: -Infinity } }, "-Infinity <= 10?");
    // XXX is this sufficient?
    T({ a: { $gt: 9.99999999999999, $lt: 10 }, x: 1 }, { $set: { x: 1 } }, "very close $gt and $lt");
    // XXX this test should be F, but since it is so hard to be precise in
    // floating point math, the current implementation falls back to T
    T({ a: { $gt: 9.999999999999999, $lt: 10 }, x: 1 }, { $set: { x: 1 } }, "very close $gt and $lt");
    T({ a: { $ne: 5 } }, { $unset: { a: 1 } }, "unset of $ne");
    T({ a: { $ne: 5 } }, { $set: { a: 1 } }, "set of $ne");
    T({ a: { $ne: "some string" }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: true }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: false }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: null }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: Infinity }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    T({ a: { $ne: 5 } }, { $set: { a: -10 } }, "set of $ne");
    T({ a: { $in: [1, 3, 5, 7] } }, { $set: { a: 5 } }, "$in checks");
    F({ a: { $in: [1, 3, 5, 7] } }, { $set: { a: -5 } }, "$in checks");
    T({ a: { $in: [1, 3, 5, 7], $gt: 6 }, x: 1 }, { $set: { x: 1 } }, "$in combination with $gt");
    F({ a: { $lte: 10, $gte: 3 } }, { $set: { 'a.b': -10 } }, "sel between x and y, set its subfield");
    F({ b: { $in: [1, 3, 5, 7] } }, { $set: { 'b.c': 2 } }, "sel $in, set subfield");
    T({ b: { $in: [1, 3, 5, 7] } }, { $set: { 'bd.c': 2, b: 3 } }, "sel $in, set similar subfield");
    F({ 'b.c': { $in: [1, 3, 5, 7] } }, { $set: { b: 2 } }, "sel subfield of set scalar");
    // If modifier tries to set a sub-field of a path expected to be a scalar.
    F({ 'a.b': { $gt: 5, $lt: 7}, x: 1 }, { $set: { 'a.b.c': 3, x: 1 } }, "set sub-field of $gt,$lt operator (scalar expected)");
    F({ 'a.b': { $gt: 5, $lt: 7}, x: 1 }, { $set: { x: 1 }, $unset: { 'a.b.c': 1 } }, "unset sub-field of $gt,$lt operator (scalar expected)");
  });

  Tinytest.add("minimongo - can selector become true by modifier - $-nonscalar selectors and simple tests", function (t) {
    test = t;
    T({ a: { $ne: { x: 5 } } }, { $set: { 'a.x': 3 } }, "set of $ne");
    // XXX this test should be F, but it is not implemented yet
    T({ a: { $ne: { x: 5 } } }, { $set: { 'a.x': 5 } }, "set of $ne");
    T({ a: { $in: [{ b: 1 }, { b: 3 }] } }, { $set: { a: { b: 3 } } }, "$in checks");
    // XXX this test should be F, but it is not implemented yet
    T({ a: { $in: [{ b: 1 }, { b: 3 }] } }, { $set: { a: { v: 3 } } }, "$in checks");
    T({ a: { $ne: { a: 2 } }, x: 1 }, { $set: { x: 1 } }, "$ne dummy");
    // XXX this test should be F, but it is not implemented yet
    T({ a: { $ne: { a: 2 } } }, { $set: { a: { a: 2 } } }, "$ne object");
  });
})();


},{}],6:[function(require,module,exports){

// Hack to make LocalCollection generate ObjectIDs by default.
LocalCollection._useOID = true;

// assert that f is a strcmp-style comparison function that puts
// 'values' in the provided order

var assert_ordering = function (test, f, values) {
  for (var i = 0; i < values.length; i++) {
    var x = f(values[i], values[i]);
    if (x !== 0) {
      // XXX super janky
      test.fail({type: "minimongo-ordering",
                 message: "value doesn't order as equal to itself",
                 value: JSON.stringify(values[i]),
                 should_be_zero_but_got: JSON.stringify(x)});
    }
    if (i + 1 < values.length) {
      var less = values[i];
      var more = values[i + 1];
      var x = f(less, more);
      if (!(x < 0)) {
        // XXX super janky
        test.fail({type: "minimongo-ordering",
                   message: "ordering test failed",
                   first: JSON.stringify(less),
                   second: JSON.stringify(more),
                   should_be_negative_but_got: JSON.stringify(x)});
      }
      x = f(more, less);
      if (!(x > 0)) {
        // XXX super janky
        test.fail({type: "minimongo-ordering",
                   message: "ordering test failed",
                   first: JSON.stringify(less),
                   second: JSON.stringify(more),
                   should_be_positive_but_got: JSON.stringify(x)});
      }
    }
  }
};

var log_callbacks = function (operations) {
  return {
    addedAt: function (obj, idx, before) {
      delete obj._id;
      operations.push(EJSON.clone(['added', obj, idx, before]));
    },
    changedAt: function (obj, old_obj, at) {
      delete obj._id;
      delete old_obj._id;
      operations.push(EJSON.clone(['changed', obj, at, old_obj]));
    },
    movedTo: function (obj, old_at, new_at, before) {
      delete obj._id;
      operations.push(EJSON.clone(['moved', obj, old_at, new_at, before]));
    },
    removedAt: function (old_obj, at) {
      var id = old_obj._id;
      delete old_obj._id;
      operations.push(EJSON.clone(['removed', id, at, old_obj]));
    }
  };
};

// XXX test shared structure in all MM entrypoints
Tinytest.add("minimongo - basics", function (test) {
  var c = new LocalCollection(),
      fluffyKitten_id,
      count;

  fluffyKitten_id = c.insert({type: "kitten", name: "fluffy"});
  c.insert({type: "kitten", name: "snookums"});
  c.insert({type: "cryptographer", name: "alice"});
  c.insert({type: "cryptographer", name: "bob"});
  c.insert({type: "cryptographer", name: "cara"});
  test.equal(c.find().count(), 5);
  test.equal(c.find({type: "kitten"}).count(), 2);
  test.equal(c.find({type: "cryptographer"}).count(), 3);
  test.length(c.find({type: "kitten"}).fetch(), 2);
  test.length(c.find({type: "cryptographer"}).fetch(), 3);
  test.equal(fluffyKitten_id, c.findOne({type: "kitten", name: "fluffy"})._id);

  c.remove({name: "cara"});
  test.equal(c.find().count(), 4);
  test.equal(c.find({type: "kitten"}).count(), 2);
  test.equal(c.find({type: "cryptographer"}).count(), 2);
  test.length(c.find({type: "kitten"}).fetch(), 2);
  test.length(c.find({type: "cryptographer"}).fetch(), 2);

  count = c.update({name: "snookums"}, {$set: {type: "cryptographer"}});
  test.equal(count, 1);
  test.equal(c.find().count(), 4);
  test.equal(c.find({type: "kitten"}).count(), 1);
  test.equal(c.find({type: "cryptographer"}).count(), 3);
  test.length(c.find({type: "kitten"}).fetch(), 1);
  test.length(c.find({type: "cryptographer"}).fetch(), 3);

  c.remove(null);
  c.remove(false);
  c.remove(undefined);
  test.equal(c.find().count(), 4);

  c.remove({_id: null});
  c.remove({_id: false});
  c.remove({_id: undefined});
  count = c.remove();
  test.equal(count, 0);
  test.equal(c.find().count(), 4);

  count = c.remove({});
  test.equal(count, 4);
  test.equal(c.find().count(), 0);

  c.insert({_id: 1, name: "strawberry", tags: ["fruit", "red", "squishy"]});
  c.insert({_id: 2, name: "apple", tags: ["fruit", "red", "hard"]});
  c.insert({_id: 3, name: "rose", tags: ["flower", "red", "squishy"]});

  test.equal(c.find({tags: "flower"}).count(), 1);
  test.equal(c.find({tags: "fruit"}).count(), 2);
  test.equal(c.find({tags: "red"}).count(), 3);
  test.length(c.find({tags: "flower"}).fetch(), 1);
  test.length(c.find({tags: "fruit"}).fetch(), 2);
  test.length(c.find({tags: "red"}).fetch(), 3);

  test.equal(c.findOne(1).name, "strawberry");
  test.equal(c.findOne(2).name, "apple");
  test.equal(c.findOne(3).name, "rose");
  test.equal(c.findOne(4), undefined);
  test.equal(c.findOne("abc"), undefined);
  test.equal(c.findOne(undefined), undefined);

  test.equal(c.find(1).count(), 1);
  test.equal(c.find(4).count(), 0);
  test.equal(c.find("abc").count(), 0);
  test.equal(c.find(undefined).count(), 0);
  test.equal(c.find().count(), 3);
  test.equal(c.find(1, {skip: 1}).count(), 0);
  test.equal(c.find({_id: 1}, {skip: 1}).count(), 0);
  test.equal(c.find({}, {skip: 1}).count(), 2);
  test.equal(c.find({}, {skip: 2}).count(), 1);
  test.equal(c.find({}, {limit: 2}).count(), 2);
  test.equal(c.find({}, {limit: 1}).count(), 1);
  test.equal(c.find({}, {skip: 1, limit: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {skip: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {limit: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {skip: 1, limit: 1}).count(), 1);
  test.equal(c.find(1, {sort: ['_id','desc'], skip: 1}).count(), 0);
  test.equal(c.find({_id: 1}, {sort: ['_id','desc'], skip: 1}).count(), 0);
  test.equal(c.find({}, {sort: ['_id','desc'], skip: 1}).count(), 2);
  test.equal(c.find({}, {sort: ['_id','desc'], skip: 2}).count(), 1);
  test.equal(c.find({}, {sort: ['_id','desc'], limit: 2}).count(), 2);
  test.equal(c.find({}, {sort: ['_id','desc'], limit: 1}).count(), 1);
  test.equal(c.find({}, {sort: ['_id','desc'], skip: 1, limit: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {sort: ['_id','desc'], skip: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {sort: ['_id','desc'], limit: 1}).count(), 1);
  test.equal(c.find({tags: "fruit"}, {sort: ['_id','desc'], skip: 1, limit: 1}).count(), 1);

  // Regression test for #455.
  c.insert({foo: {bar: 'baz'}});
  test.equal(c.find({foo: {bam: 'baz'}}).count(), 0);
  test.equal(c.find({foo: {bar: 'baz'}}).count(), 1);

});

Tinytest.add("minimongo - cursors", function (test) {
  var c = new LocalCollection();
  var res;

  for (var i = 0; i < 20; i++)
    c.insert({i: i});

  var q = c.find();
  test.equal(q.count(), 20);

  // fetch
  res = q.fetch();
  test.length(res, 20);
  for (var i = 0; i < 20; i++) {
    test.equal(res[i].i, i);
  }
  // call it again, it still works
  test.length(q.fetch(), 20);

  // forEach
  var count = 0;
  var context = {};
  q.forEach(function (obj, i, cursor) {
    test.equal(obj.i, count++);
    test.equal(obj.i, i);
    test.isTrue(context === this);
    test.isTrue(cursor === q);
  }, context);
  test.equal(count, 20);
  // call it again, it still works
  test.length(q.fetch(), 20);

  // map
  res = q.map(function (obj, i, cursor) {
    test.equal(obj.i, i);
    test.isTrue(context === this);
    test.isTrue(cursor === q);
    return obj.i * 2;
  }, context);
  test.length(res, 20);
  for (var i = 0; i < 20; i++)
    test.equal(res[i], i * 2);
  // call it again, it still works
  test.length(q.fetch(), 20);

  // findOne (and no rewind first)
  test.equal(c.findOne({i: 0}).i, 0);
  test.equal(c.findOne({i: 1}).i, 1);
  var id = c.findOne({i: 2})._id;
  test.equal(c.findOne(id).i, 2);
});

Tinytest.add("minimongo - transform", function (test) {
  var c = new LocalCollection;
  c.insert({});
  // transform functions must return objects
  var invalidTransform = function (doc) { return doc._id; };
  test.throws(function () {
    c.findOne({}, {transform: invalidTransform});
  });

  // transformed documents get _id field transplanted if not present
  var transformWithoutId = function (doc) { return _.omit(doc, '_id'); };
  test.equal(c.findOne({}, {transform: transformWithoutId})._id,
             c.findOne()._id);
});

Tinytest.add("minimongo - misc", function (test) {
  // deepcopy
  var a = {a: [1, 2, 3], b: "x", c: true, d: {x: 12, y: [12]},
           f: null, g: new Date()};
  var b = EJSON.clone(a);
  test.equal(a, b);
  test.isTrue(LocalCollection._f._equal(a, b));
  a.a.push(4);
  test.length(b.a, 3);
  a.c = false;
  test.isTrue(b.c);
  b.d.z = 15;
  a.d.z = 14;
  test.equal(b.d.z, 15);
  a.d.y.push(88);
  test.length(b.d.y, 1);
  test.equal(a.g, b.g);
  b.g.setDate(b.g.getDate() + 1);
  test.notEqual(a.g, b.g);

  a = {x: function () {}};
  b = EJSON.clone(a);
  a.x.a = 14;
  test.equal(b.x.a, 14); // just to document current behavior
});

Tinytest.add("minimongo - lookup", function (test) {
  var lookupA = MinimongoTest.makeLookupFunction('a');
  test.equal(lookupA({}), [{value: undefined}]);
  test.equal(lookupA({a: 1}), [{value: 1}]);
  test.equal(lookupA({a: [1]}), [{value: [1]}]);

  var lookupAX = MinimongoTest.makeLookupFunction('a.x');
  test.equal(lookupAX({a: {x: 1}}), [{value: 1}]);
  test.equal(lookupAX({a: {x: [1]}}), [{value: [1]}]);
  test.equal(lookupAX({a: 5}), [{value: undefined}]);
  test.equal(lookupAX({a: [{x: 1}, {x: [2]}, {y: 3}]}),
             [{value: 1, arrayIndices: [0]},
              {value: [2], arrayIndices: [1]},
              {value: undefined, arrayIndices: [2]}]);

  var lookupA0X = MinimongoTest.makeLookupFunction('a.0.x');
  test.equal(lookupA0X({a: [{x: 1}]}), [
    // From interpreting '0' as "0th array element".
    {value: 1, arrayIndices: [0, 'x']},
    // From interpreting '0' as "after branching in the array, look in the
    // object {x:1} for a field named 0".
    {value: undefined, arrayIndices: [0]}]);
  test.equal(lookupA0X({a: [{x: [1]}]}), [
    {value: [1], arrayIndices: [0, 'x']},
    {value: undefined, arrayIndices: [0]}]);
  test.equal(lookupA0X({a: 5}), [{value: undefined}]);
  test.equal(lookupA0X({a: [{x: 1}, {x: [2]}, {y: 3}]}), [
    // From interpreting '0' as "0th array element".
    {value: 1, arrayIndices: [0, 'x']},
    // From interpreting '0' as "after branching in the array, look in the
    // object {x:1} for a field named 0".
    {value: undefined, arrayIndices: [0]},
    {value: undefined, arrayIndices: [1]},
    {value: undefined, arrayIndices: [2]}
  ]);

  test.equal(
    MinimongoTest.makeLookupFunction('w.x.0.z')({
      w: [{x: [{z: 5}]}]}), [
        // From interpreting '0' as "0th array element".
        {value: 5, arrayIndices: [0, 0, 'x']},
        // From interpreting '0' as "after branching in the array, look in the
        // object {z:5} for a field named "0".
        {value: undefined, arrayIndices: [0, 0]}
      ]);
});

Tinytest.add("minimongo - selector_compiler", function (test) {
  var matches = function (shouldMatch, selector, doc) {
    var doesMatch = new Minimongo.Matcher(selector).documentMatches(doc).result;
    if (doesMatch != shouldMatch) {
      // XXX super janky
      test.fail({message: "minimongo match failure: document " +
                 (shouldMatch ? "should match, but doesn't" :
                  "shouldn't match, but does"),
                 selector: JSON.stringify(selector),
                 document: JSON.stringify(doc)
                });
    }
  };

  var match = _.bind(matches, null, true);
  var nomatch = _.bind(matches, null, false);

  // XXX blog post about what I learned while writing these tests (weird
  // mongo edge cases)

  // empty selectors
  match({}, {});
  match({}, {a: 12});

  // scalars
  match(1, {_id: 1, a: 'foo'});
  nomatch(1, {_id: 2, a: 'foo'});
  match('a', {_id: 'a', a: 'foo'});
  nomatch('a', {_id: 'b', a: 'foo'});

  // safety
  nomatch(undefined, {});
  nomatch(undefined, {_id: 'foo'});
  nomatch(false, {_id: 'foo'});
  nomatch(null, {_id: 'foo'});
  nomatch({_id: undefined}, {_id: 'foo'});
  nomatch({_id: false}, {_id: 'foo'});
  nomatch({_id: null}, {_id: 'foo'});

  // matching one or more keys
  nomatch({a: 12}, {});
  match({a: 12}, {a: 12});
  match({a: 12}, {a: 12, b: 13});
  match({a: 12, b: 13}, {a: 12, b: 13});
  match({a: 12, b: 13}, {a: 12, b: 13, c: 14});
  nomatch({a: 12, b: 13, c: 14}, {a: 12, b: 13});
  nomatch({a: 12, b: 13}, {b: 13, c: 14});

  match({a: 12}, {a: [12]});
  match({a: 12}, {a: [11, 12, 13]});
  nomatch({a: 12}, {a: [11, 13]});
  match({a: 12, b: 13}, {a: [11, 12, 13], b: [13, 14, 15]});
  nomatch({a: 12, b: 13}, {a: [11, 12, 13], b: [14, 15]});

  // dates
  var date1 = new Date;
  var date2 = new Date(date1.getTime() + 1000);
  match({a: date1}, {a: date1});
  nomatch({a: date1}, {a: date2});


  // arrays
  match({a: [1,2]}, {a: [1, 2]});
  match({a: [1,2]}, {a: [[1, 2]]});
  match({a: [1,2]}, {a: [[3, 4], [1, 2]]});
  nomatch({a: [1,2]}, {a: [3, 4]});
  nomatch({a: [1,2]}, {a: [[[1, 2]]]});

  // literal documents
  match({a: {b: 12}}, {a: {b: 12}});
  nomatch({a: {b: 12, c: 13}}, {a: {b: 12}});
  nomatch({a: {b: 12}}, {a: {b: 12, c: 13}});
  match({a: {b: 12, c: 13}}, {a: {b: 12, c: 13}});
  nomatch({a: {b: 12, c: 13}}, {a: {c: 13, b: 12}}); // tested on mongodb
  nomatch({a: {}}, {a: {b: 12}});
  nomatch({a: {b:12}}, {a: {}});
  match(
    {a: {b: 12, c: [13, true, false, 2.2, "a", null, {d: 14}]}},
    {a: {b: 12, c: [13, true, false, 2.2, "a", null, {d: 14}]}});
  match({a: {b: 12}}, {a: {b: 12}, k: 99});

  match({a: {b: 12}}, {a: [{b: 12}]});
  nomatch({a: {b: 12}}, {a: [[{b: 12}]]});
  match({a: {b: 12}}, {a: [{b: 11}, {b: 12}, {b: 13}]});
  nomatch({a: {b: 12}}, {a: [{b: 11}, {b: 12, c: 20}, {b: 13}]});
  nomatch({a: {b: 12, c: 20}}, {a: [{b: 11}, {b: 12}, {c: 20}]});
  match({a: {b: 12, c: 20}}, {a: [{b: 11}, {b: 12, c: 20}, {b: 13}]});

  // null
  match({a: null}, {a: null});
  match({a: null}, {b: 12});
  nomatch({a: null}, {a: 12});
  match({a: null}, {a: [1, 2, null, 3]}); // tested on mongodb
  nomatch({a: null}, {a: [1, 2, {}, 3]}); // tested on mongodb

  // order comparisons: $lt, $gt, $lte, $gte
  match({a: {$lt: 10}}, {a: 9});
  nomatch({a: {$lt: 10}}, {a: 10});
  nomatch({a: {$lt: 10}}, {a: 11});

  match({a: {$gt: 10}}, {a: 11});
  nomatch({a: {$gt: 10}}, {a: 10});
  nomatch({a: {$gt: 10}}, {a: 9});

  match({a: {$lte: 10}}, {a: 9});
  match({a: {$lte: 10}}, {a: 10});
  nomatch({a: {$lte: 10}}, {a: 11});

  match({a: {$gte: 10}}, {a: 11});
  match({a: {$gte: 10}}, {a: 10});
  nomatch({a: {$gte: 10}}, {a: 9});

  match({a: {$lt: 10}}, {a: [11, 9, 12]});
  nomatch({a: {$lt: 10}}, {a: [11, 12]});

  // (there's a full suite of ordering test elsewhere)
  nomatch({a: {$lt: "null"}}, {a: null});
  match({a: {$lt: {x: [2, 3, 4]}}}, {a: {x: [1, 3, 4]}});
  match({a: {$gt: {x: [2, 3, 4]}}}, {a: {x: [3, 3, 4]}});
  nomatch({a: {$gt: {x: [2, 3, 4]}}}, {a: {x: [1, 3, 4]}});
  nomatch({a: {$gt: {x: [2, 3, 4]}}}, {a: {x: [2, 3, 4]}});
  nomatch({a: {$lt: {x: [2, 3, 4]}}}, {a: {x: [2, 3, 4]}});
  match({a: {$gte: {x: [2, 3, 4]}}}, {a: {x: [2, 3, 4]}});
  match({a: {$lte: {x: [2, 3, 4]}}}, {a: {x: [2, 3, 4]}});

  nomatch({a: {$gt: [2, 3]}}, {a: [1, 2]}); // tested against mongodb

  // composition of two qualifiers
  nomatch({a: {$lt: 11, $gt: 9}}, {a: 8});
  nomatch({a: {$lt: 11, $gt: 9}}, {a: 9});
  match({a: {$lt: 11, $gt: 9}}, {a: 10});
  nomatch({a: {$lt: 11, $gt: 9}}, {a: 11});
  nomatch({a: {$lt: 11, $gt: 9}}, {a: 12});

  match({a: {$lt: 11, $gt: 9}}, {a: [8, 9, 10, 11, 12]});
  match({a: {$lt: 11, $gt: 9}}, {a: [8, 9, 11, 12]}); // tested against mongodb

  // $all
  match({a: {$all: [1, 2]}}, {a: [1, 2]});
  nomatch({a: {$all: [1, 2, 3]}}, {a: [1, 2]});
  match({a: {$all: [1, 2]}}, {a: [3, 2, 1]});
  match({a: {$all: [1, "x"]}}, {a: [3, "x", 1]});
  nomatch({a: {$all: ['2']}}, {a: 2});
  nomatch({a: {$all: [2]}}, {a: '2'});
  match({a: {$all: [[1, 2], [1, 3]]}}, {a: [[1, 3], [1, 2], [1, 4]]});
  nomatch({a: {$all: [[1, 2], [1, 3]]}}, {a: [[1, 4], [1, 2], [1, 4]]});
  match({a: {$all: [2, 2]}}, {a: [2]}); // tested against mongodb
  nomatch({a: {$all: [2, 3]}}, {a: [2, 2]});

  nomatch({a: {$all: [1, 2]}}, {a: [[1, 2]]}); // tested against mongodb
  nomatch({a: {$all: [1, 2]}}, {}); // tested against mongodb, field doesn't exist
  nomatch({a: {$all: [1, 2]}}, {a: {foo: 'bar'}}); // tested against mongodb, field is not an object
  nomatch({a: {$all: []}}, {a: []});
  nomatch({a: {$all: []}}, {a: [5]});
  match({a: {$all: [/i/, /e/i]}}, {a: ["foo", "bEr", "biz"]});
  nomatch({a: {$all: [/i/, /e/i]}}, {a: ["foo", "bar", "biz"]});
  match({a: {$all: [{b: 3}]}}, {a: [{b: 3}]});
  // Members of $all other than regexps are *equality matches*, not document
  // matches.
  nomatch({a: {$all: [{b: 3}]}}, {a: [{b: 3, k: 4}]});
  test.throws(function () {
    match({a: {$all: [{$gt: 4}]}}, {});
  });

  // $exists
  match({a: {$exists: true}}, {a: 12});
  nomatch({a: {$exists: true}}, {b: 12});
  nomatch({a: {$exists: false}}, {a: 12});
  match({a: {$exists: false}}, {b: 12});

  match({a: {$exists: true}}, {a: []});
  nomatch({a: {$exists: true}}, {b: []});
  nomatch({a: {$exists: false}}, {a: []});
  match({a: {$exists: false}}, {b: []});

  match({a: {$exists: true}}, {a: [1]});
  nomatch({a: {$exists: true}}, {b: [1]});
  nomatch({a: {$exists: false}}, {a: [1]});
  match({a: {$exists: false}}, {b: [1]});

  match({a: {$exists: 1}}, {a: 5});
  match({a: {$exists: 0}}, {b: 5});

  nomatch({'a.x':{$exists: false}}, {a: [{}, {x: 5}]});
  match({'a.x':{$exists: true}}, {a: [{}, {x: 5}]});
  match({'a.x':{$exists: true}}, {a: [{}, {x: 5}]});
  match({'a.x':{$exists: true}}, {a: {x: []}});
  match({'a.x':{$exists: true}}, {a: {x: null}});

  // $mod
  match({a: {$mod: [10, 1]}}, {a: 11});
  nomatch({a: {$mod: [10, 1]}}, {a: 12});
  match({a: {$mod: [10, 1]}}, {a: [10, 11, 12]});
  nomatch({a: {$mod: [10, 1]}}, {a: [10, 12]});
  _.each([
    5,
    [10],
    [10, 1, 2],
    "foo",
    {bar: 1},
    []
  ], function (badMod) {
    test.throws(function () {
      match({a: {$mod: badMod}}, {a: 11});
    });
  });

  // $ne
  match({a: {$ne: 1}}, {a: 2});
  nomatch({a: {$ne: 2}}, {a: 2});
  match({a: {$ne: [1]}}, {a: [2]});

  nomatch({a: {$ne: [1, 2]}}, {a: [1, 2]}); // all tested against mongodb
  nomatch({a: {$ne: 1}}, {a: [1, 2]});
  nomatch({a: {$ne: 2}}, {a: [1, 2]});
  match({a: {$ne: 3}}, {a: [1, 2]});
  nomatch({'a.b': {$ne: 1}}, {a: [{b: 1}, {b: 2}]});
  nomatch({'a.b': {$ne: 2}}, {a: [{b: 1}, {b: 2}]});
  match({'a.b': {$ne: 3}}, {a: [{b: 1}, {b: 2}]});

  nomatch({a: {$ne: {x: 1}}}, {a: {x: 1}});
  match({a: {$ne: {x: 1}}}, {a: {x: 2}});
  match({a: {$ne: {x: 1}}}, {a: {x: 1, y: 2}});

  // This query means: All 'a.b' must be non-5, and some 'a.b' must be >6.
  match({'a.b': {$ne: 5, $gt: 6}}, {a: [{b: 2}, {b: 10}]});
  nomatch({'a.b': {$ne: 5, $gt: 6}}, {a: [{b: 2}, {b: 4}]});
  nomatch({'a.b': {$ne: 5, $gt: 6}}, {a: [{b: 2}, {b: 5}]});
  nomatch({'a.b': {$ne: 5, $gt: 6}}, {a: [{b: 10}, {b: 5}]});
  // Should work the same if the branch is at the bottom.
  match({a: {$ne: 5, $gt: 6}}, {a: [2, 10]});
  nomatch({a: {$ne: 5, $gt: 6}}, {a: [2, 4]});
  nomatch({a: {$ne: 5, $gt: 6}}, {a: [2, 5]});
  nomatch({a: {$ne: 5, $gt: 6}}, {a: [10, 5]});

  // $in
  match({a: {$in: [1, 2, 3]}}, {a: 2});
  nomatch({a: {$in: [1, 2, 3]}}, {a: 4});
  match({a: {$in: [[1], [2], [3]]}}, {a: [2]});
  nomatch({a: {$in: [[1], [2], [3]]}}, {a: [4]});
  match({a: {$in: [{b: 1}, {b: 2}, {b: 3}]}}, {a: {b: 2}});
  nomatch({a: {$in: [{b: 1}, {b: 2}, {b: 3}]}}, {a: {b: 4}});

  match({a: {$in: [1, 2, 3]}}, {a: [2]}); // tested against mongodb
  match({a: {$in: [{x: 1}, {x: 2}, {x: 3}]}}, {a: [{x: 2}]});
  match({a: {$in: [1, 2, 3]}}, {a: [4, 2]});
  nomatch({a: {$in: [1, 2, 3]}}, {a: [4]});

  match({a: {$in: ['x', /foo/i]}}, {a: 'x'});
  match({a: {$in: ['x', /foo/i]}}, {a: 'fOo'});
  match({a: {$in: ['x', /foo/i]}}, {a: ['f', 'fOo']});
  nomatch({a: {$in: ['x', /foo/i]}}, {a: ['f', 'fOx']});

  match({a: {$in: [1, null]}}, {});
  match({'a.b': {$in: [1, null]}}, {});
  match({'a.b': {$in: [1, null]}}, {a: {}});
  match({'a.b': {$in: [1, null]}}, {a: {b: null}});
  nomatch({'a.b': {$in: [1, null]}}, {a: {b: 5}});
  nomatch({'a.b': {$in: [1]}}, {a: {b: null}});
  nomatch({'a.b': {$in: [1]}}, {a: {}});
  nomatch({'a.b': {$in: [1, null]}}, {a: [{b: 5}]});
  match({'a.b': {$in: [1, null]}}, {a: [{b: 5}, {}]});
  nomatch({'a.b': {$in: [1, null]}}, {a: [{b: 5}, []]});
  nomatch({'a.b': {$in: [1, null]}}, {a: [{b: 5}, 5]});

  // $nin
  nomatch({a: {$nin: [1, 2, 3]}}, {a: 2});
  match({a: {$nin: [1, 2, 3]}}, {a: 4});
  nomatch({a: {$nin: [[1], [2], [3]]}}, {a: [2]});
  match({a: {$nin: [[1], [2], [3]]}}, {a: [4]});
  nomatch({a: {$nin: [{b: 1}, {b: 2}, {b: 3}]}}, {a: {b: 2}});
  match({a: {$nin: [{b: 1}, {b: 2}, {b: 3}]}}, {a: {b: 4}});

  nomatch({a: {$nin: [1, 2, 3]}}, {a: [2]}); // tested against mongodb
  nomatch({a: {$nin: [{x: 1}, {x: 2}, {x: 3}]}}, {a: [{x: 2}]});
  nomatch({a: {$nin: [1, 2, 3]}}, {a: [4, 2]});
  nomatch({'a.b': {$nin: [1, 2, 3]}}, {a: [{b:4}, {b:2}]});
  match({a: {$nin: [1, 2, 3]}}, {a: [4]});
  match({'a.b': {$nin: [1, 2, 3]}}, {a: [{b:4}]});

  nomatch({a: {$nin: ['x', /foo/i]}}, {a: 'x'});
  nomatch({a: {$nin: ['x', /foo/i]}}, {a: 'fOo'});
  nomatch({a: {$nin: ['x', /foo/i]}}, {a: ['f', 'fOo']});
  match({a: {$nin: ['x', /foo/i]}}, {a: ['f', 'fOx']});

  nomatch({a: {$nin: [1, null]}}, {});
  nomatch({'a.b': {$nin: [1, null]}}, {});
  nomatch({'a.b': {$nin: [1, null]}}, {a: {}});
  nomatch({'a.b': {$nin: [1, null]}}, {a: {b: null}});
  match({'a.b': {$nin: [1, null]}}, {a: {b: 5}});
  match({'a.b': {$nin: [1]}}, {a: {b: null}});
  match({'a.b': {$nin: [1]}}, {a: {}});
  match({'a.b': {$nin: [1, null]}}, {a: [{b: 5}]});
  nomatch({'a.b': {$nin: [1, null]}}, {a: [{b: 5}, {}]});
  match({'a.b': {$nin: [1, null]}}, {a: [{b: 5}, []]});
  match({'a.b': {$nin: [1, null]}}, {a: [{b: 5}, 5]});

  // $size
  match({a: {$size: 0}}, {a: []});
  match({a: {$size: 1}}, {a: [2]});
  match({a: {$size: 2}}, {a: [2, 2]});
  nomatch({a: {$size: 0}}, {a: [2]});
  nomatch({a: {$size: 1}}, {a: []});
  nomatch({a: {$size: 1}}, {a: [2, 2]});
  nomatch({a: {$size: 0}}, {a: "2"});
  nomatch({a: {$size: 1}}, {a: "2"});
  nomatch({a: {$size: 2}}, {a: "2"});

  nomatch({a: {$size: 2}}, {a: [[2,2]]}); // tested against mongodb

  // $type
  match({a: {$type: 1}}, {a: 1.1});
  match({a: {$type: 1}}, {a: 1});
  nomatch({a: {$type: 1}}, {a: "1"});
  match({a: {$type: 2}}, {a: "1"});
  nomatch({a: {$type: 2}}, {a: 1});
  match({a: {$type: 3}}, {a: {}});
  match({a: {$type: 3}}, {a: {b: 2}});
  nomatch({a: {$type: 3}}, {a: []});
  nomatch({a: {$type: 3}}, {a: [1]});
  nomatch({a: {$type: 3}}, {a: null});
  match({a: {$type: 5}}, {a: EJSON.newBinary(0)});
  match({a: {$type: 5}}, {a: EJSON.newBinary(4)});
  nomatch({a: {$type: 5}}, {a: []});
  nomatch({a: {$type: 5}}, {a: [42]});
  match({a: {$type: 7}}, {a: new LocalCollection._ObjectID()});
  nomatch({a: {$type: 7}}, {a: "1234567890abcd1234567890"});
  match({a: {$type: 8}}, {a: true});
  match({a: {$type: 8}}, {a: false});
  nomatch({a: {$type: 8}}, {a: "true"});
  nomatch({a: {$type: 8}}, {a: 0});
  nomatch({a: {$type: 8}}, {a: null});
  nomatch({a: {$type: 8}}, {a: ''});
  nomatch({a: {$type: 8}}, {});
  match({a: {$type: 9}}, {a: (new Date)});
  nomatch({a: {$type: 9}}, {a: +(new Date)});
  match({a: {$type: 10}}, {a: null});
  nomatch({a: {$type: 10}}, {a: false});
  nomatch({a: {$type: 10}}, {a: ''});
  nomatch({a: {$type: 10}}, {a: 0});
  nomatch({a: {$type: 10}}, {});
  match({a: {$type: 11}}, {a: /x/});
  nomatch({a: {$type: 11}}, {a: 'x'});
  nomatch({a: {$type: 11}}, {});

  // The normal rule for {$type:4} (4 means array) is that it NOT good enough to
  // just have an array that's the leaf that matches the path.  (An array inside
  // that array is good, though.)
  nomatch({a: {$type: 4}}, {a: []});
  nomatch({a: {$type: 4}}, {a: [1]}); // tested against mongodb
  match({a: {$type: 1}}, {a: [1]});
  nomatch({a: {$type: 2}}, {a: [1]});
  match({a: {$type: 1}}, {a: ["1", 1]});
  match({a: {$type: 2}}, {a: ["1", 1]});
  nomatch({a: {$type: 3}}, {a: ["1", 1]});
  nomatch({a: {$type: 4}}, {a: ["1", 1]});
  nomatch({a: {$type: 1}}, {a: ["1", []]});
  match({a: {$type: 2}}, {a: ["1", []]});
  match({a: {$type: 4}}, {a: ["1", []]}); // tested against mongodb
  // An exception to the normal rule is that an array found via numeric index is
  // examined itself, and its elements are not.
  match({'a.0': {$type: 4}}, {a: [[0]]});
  nomatch({'a.0': {$type: 1}}, {a: [[0]]});

  // regular expressions
  match({a: /a/}, {a: 'cat'});
  nomatch({a: /a/}, {a: 'cut'});
  nomatch({a: /a/}, {a: 'CAT'});
  match({a: /a/i}, {a: 'CAT'});
  match({a: /a/}, {a: ['foo', 'bar']});  // search within array...
  nomatch({a: /,/}, {a: ['foo', 'bar']});  // but not by stringifying
  match({a: {$regex: 'a'}}, {a: ['foo', 'bar']});
  nomatch({a: {$regex: ','}}, {a: ['foo', 'bar']});
  match({a: {$regex: /a/}}, {a: 'cat'});
  nomatch({a: {$regex: /a/}}, {a: 'cut'});
  nomatch({a: {$regex: /a/}}, {a: 'CAT'});
  match({a: {$regex: /a/i}}, {a: 'CAT'});
  match({a: {$regex: /a/, $options: 'i'}}, {a: 'CAT'}); // tested
  match({a: {$regex: /a/i, $options: 'i'}}, {a: 'CAT'}); // tested
  nomatch({a: {$regex: /a/i, $options: ''}}, {a: 'CAT'}); // tested
  match({a: {$regex: 'a'}}, {a: 'cat'});
  nomatch({a: {$regex: 'a'}}, {a: 'cut'});
  nomatch({a: {$regex: 'a'}}, {a: 'CAT'});
  match({a: {$regex: 'a', $options: 'i'}}, {a: 'CAT'});
  match({a: {$regex: '', $options: 'i'}}, {a: 'foo'});
  nomatch({a: {$regex: '', $options: 'i'}}, {});
  nomatch({a: {$regex: '', $options: 'i'}}, {a: 5});
  nomatch({a: /undefined/}, {});
  nomatch({a: {$regex: 'undefined'}}, {});
  nomatch({a: /xxx/}, {});
  nomatch({a: {$regex: 'xxx'}}, {});

  // GitHub issue #2817:
  // Regexps with a global flag ('g') keep a state when tested against the same
  // string. Selector shouldn't return different result for similar documents
  // because of this state.
  var reusedRegexp = /sh/ig;
  match({a: reusedRegexp}, {a: 'Shorts'});
  match({a: reusedRegexp}, {a: 'Shorts'});
  match({a: reusedRegexp}, {a: 'Shorts'});

  match({a: {$regex: reusedRegexp}}, {a: 'Shorts'});
  match({a: {$regex: reusedRegexp}}, {a: 'Shorts'});
  match({a: {$regex: reusedRegexp}}, {a: 'Shorts'});

  test.throws(function () {
    match({a: {$options: 'i'}}, {a: 12});
  });

  match({a: /a/}, {a: ['dog', 'cat']});
  nomatch({a: /a/}, {a: ['dog', 'puppy']});

  // we don't support regexps in minimongo very well (eg, there's no EJSON
  // encoding so it won't go over the wire), but run these tests anyway
  match({a: /a/}, {a: /a/});
  match({a: /a/}, {a: ['x', /a/]});
  nomatch({a: /a/}, {a: /a/i});
  nomatch({a: /a/m}, {a: /a/});
  nomatch({a: /a/}, {a: /b/});
  nomatch({a: /5/}, {a: 5});
  nomatch({a: /t/}, {a: true});
  match({a: /m/i}, {a: ['x', 'xM']});

  test.throws(function () {
    match({a: {$regex: /a/, $options: 'x'}}, {a: 'cat'});
  });
  test.throws(function () {
    match({a: {$regex: /a/, $options: 's'}}, {a: 'cat'});
  });

  // $not
  match({x: {$not: {$gt: 7}}}, {x: 6});
  nomatch({x: {$not: {$gt: 7}}}, {x: 8});
  match({x: {$not: {$lt: 10, $gt: 7}}}, {x: 11});
  nomatch({x: {$not: {$lt: 10, $gt: 7}}}, {x: 9});
  match({x: {$not: {$lt: 10, $gt: 7}}}, {x: 6});

  match({x: {$not: {$gt: 7}}}, {x: [2, 3, 4]});
  match({'x.y': {$not: {$gt: 7}}}, {x: [{y:2}, {y:3}, {y:4}]});
  nomatch({x: {$not: {$gt: 7}}}, {x: [2, 3, 4, 10]});
  nomatch({'x.y': {$not: {$gt: 7}}}, {x: [{y:2}, {y:3}, {y:4}, {y:10}]});

  match({x: {$not: /a/}}, {x: "dog"});
  nomatch({x: {$not: /a/}}, {x: "cat"});
  match({x: {$not: /a/}}, {x: ["dog", "puppy"]});
  nomatch({x: {$not: /a/}}, {x: ["kitten", "cat"]});

  // dotted keypaths: bare values
  match({"a.b": 1}, {a: {b: 1}});
  nomatch({"a.b": 1}, {a: {b: 2}});
  match({"a.b": [1,2,3]}, {a: {b: [1,2,3]}});
  nomatch({"a.b": [1,2,3]}, {a: {b: [4]}});
  match({"a.b": /a/}, {a: {b: "cat"}});
  nomatch({"a.b": /a/}, {a: {b: "dog"}});
  match({"a.b.c": null}, {});
  match({"a.b.c": null}, {a: 1});
  match({"a.b": null}, {a: 1});
  match({"a.b.c": null}, {a: {b: 4}});

  // dotted keypaths, nulls, numeric indices, arrays
  nomatch({"a.b": null}, {a: [1]});
  match({"a.b": []}, {a: {b: []}});
  var big = {a: [{b: 1}, 2, {}, {b: [3, 4]}]};
  match({"a.b": 1}, big);
  match({"a.b": [3, 4]}, big);
  match({"a.b": 3}, big);
  match({"a.b": 4}, big);
  match({"a.b": null}, big);  // matches on slot 2
  match({'a.1': 8}, {a: [7, 8, 9]});
  nomatch({'a.1': 7}, {a: [7, 8, 9]});
  nomatch({'a.1': null}, {a: [7, 8, 9]});
  match({'a.1': [8, 9]}, {a: [7, [8, 9]]});
  nomatch({'a.1': 6}, {a: [[6, 7], [8, 9]]});
  nomatch({'a.1': 7}, {a: [[6, 7], [8, 9]]});
  nomatch({'a.1': 8}, {a: [[6, 7], [8, 9]]});
  nomatch({'a.1': 9}, {a: [[6, 7], [8, 9]]});
  match({"a.1": 2}, {a: [0, {1: 2}, 3]});
  match({"a.1": {1: 2}}, {a: [0, {1: 2}, 3]});
  match({"x.1.y": 8}, {x: [7, {y: 8}, 9]});
  // comes from trying '1' as key in the plain object
  match({"x.1.y": null}, {x: [7, {y: 8}, 9]});
  match({"a.1.b": 9}, {a: [7, {b: 9}, {1: {b: 'foo'}}]});
  match({"a.1.b": 'foo'}, {a: [7, {b: 9}, {1: {b: 'foo'}}]});
  match({"a.1.b": null}, {a: [7, {b: 9}, {1: {b: 'foo'}}]});
  match({"a.1.b": 2}, {a: [1, [{b: 2}], 3]});
  nomatch({"a.1.b": null}, {a: [1, [{b: 2}], 3]});
  // this is new behavior in mongo 2.5
  nomatch({"a.0.b": null}, {a: [5]});
  match({"a.1": 4}, {a: [{1: 4}, 5]});
  match({"a.1": 5}, {a: [{1: 4}, 5]});
  nomatch({"a.1": null}, {a: [{1: 4}, 5]});
  match({"a.1.foo": 4}, {a: [{1: {foo: 4}}, {foo: 5}]});
  match({"a.1.foo": 5}, {a: [{1: {foo: 4}}, {foo: 5}]});
  match({"a.1.foo": null}, {a: [{1: {foo: 4}}, {foo: 5}]});

  // trying to access a dotted field that is undefined at some point
  // down the chain
  nomatch({"a.b": 1}, {x: 2});
  nomatch({"a.b.c": 1}, {a: {x: 2}});
  nomatch({"a.b.c": 1}, {a: {b: {x: 2}}});
  nomatch({"a.b.c": 1}, {a: {b: 1}});
  nomatch({"a.b.c": 1}, {a: {b: 0}});

  // dotted keypaths: literal objects
  match({"a.b": {c: 1}}, {a: {b: {c: 1}}});
  nomatch({"a.b": {c: 1}}, {a: {b: {c: 2}}});
  nomatch({"a.b": {c: 1}}, {a: {b: 2}});
  match({"a.b": {c: 1, d: 2}}, {a: {b: {c: 1, d: 2}}});
  nomatch({"a.b": {c: 1, d: 2}}, {a: {b: {c: 1, d: 1}}});
  nomatch({"a.b": {c: 1, d: 2}}, {a: {b: {d: 2}}});

  // dotted keypaths: $ operators
  match({"a.b": {$in: [1, 2, 3]}}, {a: {b: [2]}}); // tested against mongodb
  match({"a.b": {$in: [{x: 1}, {x: 2}, {x: 3}]}}, {a: {b: [{x: 2}]}});
  match({"a.b": {$in: [1, 2, 3]}}, {a: {b: [4, 2]}});
  nomatch({"a.b": {$in: [1, 2, 3]}}, {a: {b: [4]}});

  // $or
  test.throws(function () {
    match({$or: []}, {});
  });
  test.throws(function () {
    match({$or: [5]}, {});
  });
  test.throws(function () {
    match({$or: []}, {a: 1});
  });
  match({$or: [{a: 1}]}, {a: 1});
  nomatch({$or: [{b: 2}]}, {a: 1});
  match({$or: [{a: 1}, {b: 2}]}, {a: 1});
  nomatch({$or: [{c: 3}, {d: 4}]}, {a: 1});
  match({$or: [{a: 1}, {b: 2}]}, {a: [1, 2, 3]});
  nomatch({$or: [{a: 1}, {b: 2}]}, {c: [1, 2, 3]});
  nomatch({$or: [{a: 1}, {b: 2}]}, {a: [2, 3, 4]});
  match({$or: [{a: 1}, {a: 2}]}, {a: 1});
  match({$or: [{a: 1}, {a: 2}], b: 2}, {a: 1, b: 2});
  nomatch({$or: [{a: 2}, {a: 3}], b: 2}, {a: 1, b: 2});
  nomatch({$or: [{a: 1}, {a: 2}], b: 3}, {a: 1, b: 2});

  // Combining $or with equality
  match({x: 1, $or: [{a: 1}, {b: 1}]}, {x: 1, b: 1});
  match({$or: [{a: 1}, {b: 1}], x: 1}, {x: 1, b: 1});
  nomatch({x: 1, $or: [{a: 1}, {b: 1}]}, {b: 1});
  nomatch({x: 1, $or: [{a: 1}, {b: 1}]}, {x: 1});

  // $or and $lt, $lte, $gt, $gte
  match({$or: [{a: {$lte: 1}}, {a: 2}]}, {a: 1});
  nomatch({$or: [{a: {$lt: 1}}, {a: 2}]}, {a: 1});
  match({$or: [{a: {$gte: 1}}, {a: 2}]}, {a: 1});
  nomatch({$or: [{a: {$gt: 1}}, {a: 2}]}, {a: 1});
  match({$or: [{b: {$gt: 1}}, {b: {$lt: 3}}]}, {b: 2});
  nomatch({$or: [{b: {$lt: 1}}, {b: {$gt: 3}}]}, {b: 2});

  // $or and $in
  match({$or: [{a: {$in: [1, 2, 3]}}]}, {a: 1});
  nomatch({$or: [{a: {$in: [4, 5, 6]}}]}, {a: 1});
  match({$or: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {a: 1});
  match({$or: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {b: 2});
  nomatch({$or: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {c: 3});
  match({$or: [{a: {$in: [1, 2, 3]}}, {b: {$in: [1, 2, 3]}}]}, {b: 2});
  nomatch({$or: [{a: {$in: [1, 2, 3]}}, {b: {$in: [4, 5, 6]}}]}, {b: 2});

  // $or and $nin
  nomatch({$or: [{a: {$nin: [1, 2, 3]}}]}, {a: 1});
  match({$or: [{a: {$nin: [4, 5, 6]}}]}, {a: 1});
  nomatch({$or: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {a: 1});
  match({$or: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {b: 2});
  match({$or: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {c: 3});
  match({$or: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {b: 2});
  nomatch({$or: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {a: 1, b: 2});
  match({$or: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [4, 5, 6]}}]}, {b: 2});

  // $or and dot-notation
  match({$or: [{"a.b": 1}, {"a.b": 2}]}, {a: {b: 1}});
  match({$or: [{"a.b": 1}, {"a.c": 1}]}, {a: {b: 1}});
  nomatch({$or: [{"a.b": 2}, {"a.c": 1}]}, {a: {b: 1}});

  // $or and nested objects
  match({$or: [{a: {b: 1, c: 2}}, {a: {b: 2, c: 1}}]}, {a: {b: 1, c: 2}});
  nomatch({$or: [{a: {b: 1, c: 3}}, {a: {b: 2, c: 1}}]}, {a: {b: 1, c: 2}});

  // $or and regexes
  match({$or: [{a: /a/}]}, {a: "cat"});
  nomatch({$or: [{a: /o/}]}, {a: "cat"});
  match({$or: [{a: /a/}, {a: /o/}]}, {a: "cat"});
  nomatch({$or: [{a: /i/}, {a: /o/}]}, {a: "cat"});
  match({$or: [{a: /i/}, {b: /o/}]}, {a: "cat", b: "dog"});

  // $or and $ne
  match({$or: [{a: {$ne: 1}}]}, {});
  nomatch({$or: [{a: {$ne: 1}}]}, {a: 1});
  match({$or: [{a: {$ne: 1}}]}, {a: 2});
  match({$or: [{a: {$ne: 1}}]}, {b: 1});
  match({$or: [{a: {$ne: 1}}, {a: {$ne: 2}}]}, {a: 1});
  match({$or: [{a: {$ne: 1}}, {b: {$ne: 1}}]}, {a: 1});
  nomatch({$or: [{a: {$ne: 1}}, {b: {$ne: 2}}]}, {a: 1, b: 2});

  // $or and $not
  match({$or: [{a: {$not: {$mod: [10, 1]}}}]}, {});
  nomatch({$or: [{a: {$not: {$mod: [10, 1]}}}]}, {a: 1});
  match({$or: [{a: {$not: {$mod: [10, 1]}}}]}, {a: 2});
  match({$or: [{a: {$not: {$mod: [10, 1]}}}, {a: {$not: {$mod: [10, 2]}}}]}, {a: 1});
  nomatch({$or: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 1});
  match({$or: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 2});
  match({$or: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 3});
  // this is possibly an open-ended task, so we stop here ...

  // $nor
  test.throws(function () {
    match({$nor: []}, {});
  });
  test.throws(function () {
    match({$nor: [5]}, {});
  });
  test.throws(function () {
    match({$nor: []}, {a: 1});
  });
  nomatch({$nor: [{a: 1}]}, {a: 1});
  match({$nor: [{b: 2}]}, {a: 1});
  nomatch({$nor: [{a: 1}, {b: 2}]}, {a: 1});
  match({$nor: [{c: 3}, {d: 4}]}, {a: 1});
  nomatch({$nor: [{a: 1}, {b: 2}]}, {a: [1, 2, 3]});
  match({$nor: [{a: 1}, {b: 2}]}, {c: [1, 2, 3]});
  match({$nor: [{a: 1}, {b: 2}]}, {a: [2, 3, 4]});
  nomatch({$nor: [{a: 1}, {a: 2}]}, {a: 1});

  // $nor and $lt, $lte, $gt, $gte
  nomatch({$nor: [{a: {$lte: 1}}, {a: 2}]}, {a: 1});
  match({$nor: [{a: {$lt: 1}}, {a: 2}]}, {a: 1});
  nomatch({$nor: [{a: {$gte: 1}}, {a: 2}]}, {a: 1});
  match({$nor: [{a: {$gt: 1}}, {a: 2}]}, {a: 1});
  nomatch({$nor: [{b: {$gt: 1}}, {b: {$lt: 3}}]}, {b: 2});
  match({$nor: [{b: {$lt: 1}}, {b: {$gt: 3}}]}, {b: 2});

  // $nor and $in
  nomatch({$nor: [{a: {$in: [1, 2, 3]}}]}, {a: 1});
  match({$nor: [{a: {$in: [4, 5, 6]}}]}, {a: 1});
  nomatch({$nor: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {a: 1});
  nomatch({$nor: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {b: 2});
  match({$nor: [{a: {$in: [1, 2, 3]}}, {b: 2}]}, {c: 3});
  nomatch({$nor: [{a: {$in: [1, 2, 3]}}, {b: {$in: [1, 2, 3]}}]}, {b: 2});
  match({$nor: [{a: {$in: [1, 2, 3]}}, {b: {$in: [4, 5, 6]}}]}, {b: 2});

  // $nor and $nin
  match({$nor: [{a: {$nin: [1, 2, 3]}}]}, {a: 1});
  nomatch({$nor: [{a: {$nin: [4, 5, 6]}}]}, {a: 1});
  match({$nor: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {a: 1});
  nomatch({$nor: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {b: 2});
  nomatch({$nor: [{a: {$nin: [1, 2, 3]}}, {b: 2}]}, {c: 3});
  nomatch({$nor: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {b: 2});
  match({$nor: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {a: 1, b: 2});
  nomatch({$nor: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [4, 5, 6]}}]}, {b: 2});

  // $nor and dot-notation
  nomatch({$nor: [{"a.b": 1}, {"a.b": 2}]}, {a: {b: 1}});
  nomatch({$nor: [{"a.b": 1}, {"a.c": 1}]}, {a: {b: 1}});
  match({$nor: [{"a.b": 2}, {"a.c": 1}]}, {a: {b: 1}});

  // $nor and nested objects
  nomatch({$nor: [{a: {b: 1, c: 2}}, {a: {b: 2, c: 1}}]}, {a: {b: 1, c: 2}});
  match({$nor: [{a: {b: 1, c: 3}}, {a: {b: 2, c: 1}}]}, {a: {b: 1, c: 2}});

  // $nor and regexes
  nomatch({$nor: [{a: /a/}]}, {a: "cat"});
  match({$nor: [{a: /o/}]}, {a: "cat"});
  nomatch({$nor: [{a: /a/}, {a: /o/}]}, {a: "cat"});
  match({$nor: [{a: /i/}, {a: /o/}]}, {a: "cat"});
  nomatch({$nor: [{a: /i/}, {b: /o/}]}, {a: "cat", b: "dog"});

  // $nor and $ne
  nomatch({$nor: [{a: {$ne: 1}}]}, {});
  match({$nor: [{a: {$ne: 1}}]}, {a: 1});
  nomatch({$nor: [{a: {$ne: 1}}]}, {a: 2});
  nomatch({$nor: [{a: {$ne: 1}}]}, {b: 1});
  nomatch({$nor: [{a: {$ne: 1}}, {a: {$ne: 2}}]}, {a: 1});
  nomatch({$nor: [{a: {$ne: 1}}, {b: {$ne: 1}}]}, {a: 1});
  match({$nor: [{a: {$ne: 1}}, {b: {$ne: 2}}]}, {a: 1, b: 2});

  // $nor and $not
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}]}, {});
  match({$nor: [{a: {$not: {$mod: [10, 1]}}}]}, {a: 1});
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}]}, {a: 2});
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}, {a: {$not: {$mod: [10, 2]}}}]}, {a: 1});
  match({$nor: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 1});
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 2});
  nomatch({$nor: [{a: {$not: {$mod: [10, 1]}}}, {a: {$mod: [10, 2]}}]}, {a: 3});

  // $and

  test.throws(function () {
    match({$and: []}, {});
  });
  test.throws(function () {
    match({$and: [5]}, {});
  });
  test.throws(function () {
    match({$and: []}, {a: 1});
  });
  match({$and: [{a: 1}]}, {a: 1});
  nomatch({$and: [{a: 1}, {a: 2}]}, {a: 1});
  nomatch({$and: [{a: 1}, {b: 1}]}, {a: 1});
  match({$and: [{a: 1}, {b: 2}]}, {a: 1, b: 2});
  nomatch({$and: [{a: 1}, {b: 1}]}, {a: 1, b: 2});
  match({$and: [{a: 1}, {b: 2}], c: 3}, {a: 1, b: 2, c: 3});
  nomatch({$and: [{a: 1}, {b: 2}], c: 4}, {a: 1, b: 2, c: 3});

  // $and and regexes
  match({$and: [{a: /a/}]}, {a: "cat"});
  match({$and: [{a: /a/i}]}, {a: "CAT"});
  nomatch({$and: [{a: /o/}]}, {a: "cat"});
  nomatch({$and: [{a: /a/}, {a: /o/}]}, {a: "cat"});
  match({$and: [{a: /a/}, {b: /o/}]}, {a: "cat", b: "dog"});
  nomatch({$and: [{a: /a/}, {b: /a/}]}, {a: "cat", b: "dog"});

  // $and, dot-notation, and nested objects
  match({$and: [{"a.b": 1}]}, {a: {b: 1}});
  match({$and: [{a: {b: 1}}]}, {a: {b: 1}});
  nomatch({$and: [{"a.b": 2}]}, {a: {b: 1}});
  nomatch({$and: [{"a.c": 1}]}, {a: {b: 1}});
  nomatch({$and: [{"a.b": 1}, {"a.b": 2}]}, {a: {b: 1}});
  nomatch({$and: [{"a.b": 1}, {a: {b: 2}}]}, {a: {b: 1}});
  match({$and: [{"a.b": 1}, {"c.d": 2}]}, {a: {b: 1}, c: {d: 2}});
  nomatch({$and: [{"a.b": 1}, {"c.d": 1}]}, {a: {b: 1}, c: {d: 2}});
  match({$and: [{"a.b": 1}, {c: {d: 2}}]}, {a: {b: 1}, c: {d: 2}});
  nomatch({$and: [{"a.b": 1}, {c: {d: 1}}]}, {a: {b: 1}, c: {d: 2}});
  nomatch({$and: [{"a.b": 2}, {c: {d: 2}}]}, {a: {b: 1}, c: {d: 2}});
  match({$and: [{a: {b: 1}}, {c: {d: 2}}]}, {a: {b: 1}, c: {d: 2}});
  nomatch({$and: [{a: {b: 2}}, {c: {d: 2}}]}, {a: {b: 1}, c: {d: 2}});

  // $and and $in
  nomatch({$and: [{a: {$in: []}}]}, {});
  match({$and: [{a: {$in: [1, 2, 3]}}]}, {a: 1});
  nomatch({$and: [{a: {$in: [4, 5, 6]}}]}, {a: 1});
  nomatch({$and: [{a: {$in: [1, 2, 3]}}, {a: {$in: [4, 5, 6]}}]}, {a: 1});
  nomatch({$and: [{a: {$in: [1, 2, 3]}}, {b: {$in: [1, 2, 3]}}]}, {a: 1, b: 4});
  match({$and: [{a: {$in: [1, 2, 3]}}, {b: {$in: [4, 5, 6]}}]}, {a: 1, b: 4});


  // $and and $nin
  match({$and: [{a: {$nin: []}}]}, {});
  nomatch({$and: [{a: {$nin: [1, 2, 3]}}]}, {a: 1});
  match({$and: [{a: {$nin: [4, 5, 6]}}]}, {a: 1});
  nomatch({$and: [{a: {$nin: [1, 2, 3]}}, {a: {$nin: [4, 5, 6]}}]}, {a: 1});
  nomatch({$and: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [1, 2, 3]}}]}, {a: 1, b: 4});
  nomatch({$and: [{a: {$nin: [1, 2, 3]}}, {b: {$nin: [4, 5, 6]}}]}, {a: 1, b: 4});

  // $and and $lt, $lte, $gt, $gte
  match({$and: [{a: {$lt: 2}}]}, {a: 1});
  nomatch({$and: [{a: {$lt: 1}}]}, {a: 1});
  match({$and: [{a: {$lte: 1}}]}, {a: 1});
  match({$and: [{a: {$gt: 0}}]}, {a: 1});
  nomatch({$and: [{a: {$gt: 1}}]}, {a: 1});
  match({$and: [{a: {$gte: 1}}]}, {a: 1});
  match({$and: [{a: {$gt: 0}}, {a: {$lt: 2}}]}, {a: 1});
  nomatch({$and: [{a: {$gt: 1}}, {a: {$lt: 2}}]}, {a: 1});
  nomatch({$and: [{a: {$gt: 0}}, {a: {$lt: 1}}]}, {a: 1});
  match({$and: [{a: {$gte: 1}}, {a: {$lte: 1}}]}, {a: 1});
  nomatch({$and: [{a: {$gte: 2}}, {a: {$lte: 0}}]}, {a: 1});

  // $and and $ne
  match({$and: [{a: {$ne: 1}}]}, {});
  nomatch({$and: [{a: {$ne: 1}}]}, {a: 1});
  match({$and: [{a: {$ne: 1}}]}, {a: 2});
  nomatch({$and: [{a: {$ne: 1}}, {a: {$ne: 2}}]}, {a: 2});
  match({$and: [{a: {$ne: 1}}, {a: {$ne: 3}}]}, {a: 2});

  // $and and $not
  match({$and: [{a: {$not: {$gt: 2}}}]}, {a: 1});
  nomatch({$and: [{a: {$not: {$lt: 2}}}]}, {a: 1});
  match({$and: [{a: {$not: {$lt: 0}}}, {a: {$not: {$gt: 2}}}]}, {a: 1});
  nomatch({$and: [{a: {$not: {$lt: 2}}}, {a: {$not: {$gt: 0}}}]}, {a: 1});

  // $where
  match({$where: "this.a === 1"}, {a: 1});
  match({$where: "obj.a === 1"}, {a: 1});
  nomatch({$where: "this.a !== 1"}, {a: 1});
  nomatch({$where: "obj.a !== 1"}, {a: 1});
  nomatch({$where: "this.a === 1", a: 2}, {a: 1});
  match({$where: "this.a === 1", b: 2}, {a: 1, b: 2});
  match({$where: "this.a === 1 && this.b === 2"}, {a: 1, b: 2});
  match({$where: "this.a instanceof Array"}, {a: []});
  nomatch({$where: "this.a instanceof Array"}, {a: 1});

  // reaching into array
  match({"dogs.0.name": "Fido"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({"dogs.1.name": "Rex"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  nomatch({"dogs.1.name": "Fido"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({"room.1b": "bla"}, {room: {"1b": "bla"}});

  match({"dogs.name": "Fido"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({"dogs.name": "Rex"}, {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({"animals.dogs.name": "Fido"},
        {animals: [{dogs: [{name: "Rover"}]},
                   {},
                   {dogs: [{name: "Fido"}, {name: "Rex"}]}]});
  match({"animals.dogs.name": "Fido"},
        {animals: [{dogs: {name: "Rex"}},
                   {dogs: {name: "Fido"}}]});
  match({"animals.dogs.name": "Fido"},
        {animals: [{dogs: [{name: "Rover"}]},
                   {},
                   {dogs: [{name: ["Fido"]}, {name: "Rex"}]}]});
  nomatch({"dogs.name": "Fido"}, {dogs: []});

  // $elemMatch
  match({dogs: {$elemMatch: {name: /e/}}},
        {dogs: [{name: "Fido"}, {name: "Rex"}]});
  nomatch({dogs: {$elemMatch: {name: /a/}}},
          {dogs: [{name: "Fido"}, {name: "Rex"}]});
  match({dogs: {$elemMatch: {age: {$gt: 4}}}},
        {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  match({dogs: {$elemMatch: {name: "Fido", age: {$gt: 4}}}},
        {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  nomatch({dogs: {$elemMatch: {name: "Fido", age: {$gt: 5}}}},
          {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  match({dogs: {$elemMatch: {name: /i/, age: {$gt: 4}}}},
        {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  nomatch({dogs: {$elemMatch: {name: /e/, age: 5}}},
          {dogs: [{name: "Fido", age: 5}, {name: "Rex", age: 3}]});
  match({x: {$elemMatch: {y: 9}}}, {x: [{y: 9}]});
  nomatch({x: {$elemMatch: {y: 9}}}, {x: [[{y: 9}]]});
  match({x: {$elemMatch: {$gt: 5, $lt: 9}}}, {x: [8]});
  nomatch({x: {$elemMatch: {$gt: 5, $lt: 9}}}, {x: [[8]]});
  match({'a.x': {$elemMatch: {y: 9}}},
        {a: [{x: []}, {x: [{y: 9}]}]});
  nomatch({a: {$elemMatch: {x: 5}}}, {a: {x: 5}});
  match({a: {$elemMatch: {0: {$gt: 5, $lt: 9}}}}, {a: [[6]]});
  match({a: {$elemMatch: {'0.b': {$gt: 5, $lt: 9}}}}, {a: [[{b:6}]]});
  match({a: {$elemMatch: {x: 1, $or: [{a: 1}, {b: 1}]}}},
        {a: [{x: 1, b: 1}]});
  match({a: {$elemMatch: {$or: [{a: 1}, {b: 1}], x: 1}}},
        {a: [{x: 1, b: 1}]});
  nomatch({a: {$elemMatch: {x: 1, $or: [{a: 1}, {b: 1}]}}},
          {a: [{b: 1}]});
  nomatch({a: {$elemMatch: {x: 1, $or: [{a: 1}, {b: 1}]}}},
          {a: [{x: 1}]});
  nomatch({a: {$elemMatch: {x: 1, $or: [{a: 1}, {b: 1}]}}},
          {a: [{x: 1}, {b: 1}]});

  // $comment
  match({a: 5, $comment: "asdf"}, {a: 5});
  nomatch({a: 6, $comment: "asdf"}, {a: 5});

  // XXX still needs tests:
  // - non-scalar arguments to $gt, $lt, etc
});

Tinytest.add("minimongo - projection_compiler", function (test) {
  var testProjection = function (projection, tests) {
    var projection_f = LocalCollection._compileProjection(projection);
    var equalNonStrict = function (a, b, desc) {
      test.isTrue(_.isEqual(a, b), desc);
    };

    _.each(tests, function (testCase) {
      equalNonStrict(projection_f(testCase[0]), testCase[1], testCase[2]);
    });
  };

  testProjection({ 'foo': 1, 'bar': 1 }, [
    [{ foo: 42, bar: "something", baz: "else" },
     { foo: 42, bar: "something" },
     "simplest - whitelist"],

    [{ foo: { nested: 17 }, baz: {} },
     { foo: { nested: 17 } },
     "nested whitelisted field"],

    [{ _id: "uid", bazbaz: 42 },
     { _id: "uid" },
     "simplest whitelist - preserve _id"]
  ]);

  testProjection({ 'foo': 0, 'bar': 0 }, [
    [{ foo: 42, bar: "something", baz: "else" },
     { baz: "else" },
     "simplest - blacklist"],

    [{ foo: { nested: 17 }, baz: { foo: "something" } },
     { baz: { foo: "something" } },
     "nested blacklisted field"],

    [{ _id: "uid", bazbaz: 42 },
     { _id: "uid", bazbaz: 42 },
     "simplest blacklist - preserve _id"]
  ]);

  testProjection({ _id: 0, foo: 1 }, [
    [{ foo: 42, bar: 33, _id: "uid" },
     { foo: 42 },
     "whitelist - _id blacklisted"]
  ]);

  testProjection({ _id: 0, foo: 0 }, [
    [{ foo: 42, bar: 33, _id: "uid" },
     { bar: 33 },
     "blacklist - _id blacklisted"]
  ]);

  testProjection({ 'foo.bar.baz': 1 }, [
    [{ foo: { meh: "fur", bar: { baz: 42 }, tr: 1 }, bar: 33, baz: 'trolololo' },
     { foo: { bar: { baz: 42 } } },
     "whitelist nested"],

    // Behavior of this test is looked up in actual mongo
    [{ foo: { meh: "fur", bar: "nope", tr: 1 }, bar: 33, baz: 'trolololo' },
     { foo: {} },
     "whitelist nested - path not found in doc, different type"],

    // Behavior of this test is looked up in actual mongo
    [{ foo: { meh: "fur", bar: [], tr: 1 }, bar: 33, baz: 'trolololo' },
     { foo: { bar: [] } },
     "whitelist nested - path not found in doc"]
  ]);

  testProjection({ 'hope.humanity': 0, 'hope.people': 0 }, [
    [{ hope: { humanity: "lost", people: 'broken', candies: 'long live!' } },
     { hope: { candies: 'long live!' } },
     "blacklist nested"],

    [{ hope: "new" },
     { hope: "new" },
     "blacklist nested - path not found in doc"]
  ]);

  testProjection({ _id: 1 }, [
    [{ _id: 42, x: 1, y: { z: "2" } },
     { _id: 42 },
     "_id whitelisted"],
    [{ _id: 33 },
     { _id: 33 },
     "_id whitelisted, _id only"],
    [{ x: 1 },
     {},
     "_id whitelisted, no _id"]
  ]);

  testProjection({ _id: 0 }, [
    [{ _id: 42, x: 1, y: { z: "2" } },
     { x: 1, y: { z: "2" } },
     "_id blacklisted"],
    [{ _id: 33 },
     {},
     "_id blacklisted, _id only"],
    [{ x: 1 },
     { x: 1 },
     "_id blacklisted, no _id"]
  ]);

  testProjection({}, [
    [{ a: 1, b: 2, c: "3" },
     { a: 1, b: 2, c: "3" },
     "empty projection"]
  ]);

  test.throws(function () {
    testProjection({ 'inc': 1, 'excl': 0 }, [
      [ { inc: 42, excl: 42 }, { inc: 42 }, "Can't combine incl/excl rules" ]
    ]);
  });

  test.throws(function () {
    testProjection({ 'a': 1, 'a.b': 1 }, [
      [ { a: { b: 42 } }, { a: { b: 42 } }, "Can't have ambiguous rules (one is prefix of another)" ]
    ]);
  });
  test.throws(function () {
    testProjection({ 'a.b.c': 1, 'a.b': 1, 'a': 1 }, [
      [ { a: { b: 42 } }, { a: { b: 42 } }, "Can't have ambiguous rules (one is prefix of another)" ]
    ]);
  });

  test.throws(function () {
    testProjection("some string", [
      [ { a: { b: 42 } }, { a: { b: 42 } }, "Projection is not a hash" ]
    ]);
  });
});

Tinytest.add("minimongo - fetch with fields", function (test) {
  var c = new LocalCollection();
  _.times(30, function (i) {
    c.insert({
      something: Random.id(),
      anything: {
        foo: "bar",
        cool: "hot"
      },
      nothing: i,
      i: i
    });
  });

  // Test just a regular fetch with some projection
  var fetchResults = c.find({}, { fields: {
    'something': 1,
    'anything.foo': 1
  } }).fetch();

  test.isTrue(_.all(fetchResults, function (x) {
    return x &&
           x.something &&
           x.anything &&
           x.anything.foo &&
           x.anything.foo === "bar" &&
           !_.has(x, 'nothing') &&
           !_.has(x.anything, 'cool');
  }));

  // Test with a selector, even field used in the selector is excluded in the
  // projection
  fetchResults = c.find({
    nothing: { $gte: 5 }
  }, {
    fields: { nothing: 0 }
  }).fetch();

  test.isTrue(_.all(fetchResults, function (x) {
    return x &&
           x.something &&
           x.anything &&
           x.anything.foo === "bar" &&
           x.anything.cool === "hot" &&
           !_.has(x, 'nothing') &&
           x.i &&
           x.i >= 5;
  }));

  test.isTrue(fetchResults.length === 25);

  // Test that we can sort, based on field excluded from the projection, use
  // skip and limit as well!
  // following find will get indexes [10..20) sorted by nothing
  fetchResults = c.find({}, {
    sort: {
      nothing: 1
    },
    limit: 10,
    skip: 10,
    fields: {
      i: 1,
      something: 1
    }
  }).fetch();

  test.isTrue(_.all(fetchResults, function (x) {
    return x &&
           x.something &&
           x.i >= 10 && x.i < 20;
  }));

  _.each(fetchResults, function (x, i, arr) {
    if (!i) return;
    test.isTrue(x.i === arr[i-1].i + 1);
  });

  // Temporary unsupported operators
  // queries are taken from MongoDB docs examples
  test.throws(function () {
    c.find({}, { fields: { 'grades.$': 1 } });
  });
  test.throws(function () {
    c.find({}, { fields: { grades: { $elemMatch: { mean: 70 } } } });
  });
  test.throws(function () {
    c.find({}, { fields: { grades: { $slice: [20, 10] } } });
  });
});

Tinytest.add("minimongo - fetch with projection, subarrays", function (test) {
  // Apparently projection of type 'foo.bar.x' for
  // { foo: [ { bar: { x: 42 } }, { bar: { x: 3 } } ] }
  // should return exactly this object. More precisely, arrays are considered as
  // sets and are queried separately and then merged back to result set
  var c = new LocalCollection();

  // Insert a test object with two set fields
  c.insert({
    setA: [{
      fieldA: 42,
      fieldB: 33
    }, {
      fieldA: "the good",
      fieldB: "the bad",
      fieldC: "the ugly"
    }],
    setB: [{
      anotherA: { },
      anotherB: "meh"
    }, {
      anotherA: 1234,
      anotherB: 431
    }]
  });

  var equalNonStrict = function (a, b, desc) {
    test.isTrue(_.isEqual(a, b), desc);
  };

  var testForProjection = function (projection, expected) {
    var fetched = c.find({}, { fields: projection }).fetch()[0];
    equalNonStrict(fetched, expected, "failed sub-set projection: " +
                                      JSON.stringify(projection));
  };

  testForProjection({ 'setA.fieldA': 1, 'setB.anotherB': 1, _id: 0 },
                    {
                      setA: [{ fieldA: 42 }, { fieldA: "the good" }],
                      setB: [{ anotherB: "meh" }, { anotherB: 431 }]
                    });

  testForProjection({ 'setA.fieldA': 0, 'setB.anotherA': 0, _id: 0 },
                    {
                      setA: [{fieldB:33}, {fieldB:"the bad",fieldC:"the ugly"}],
                      setB: [{ anotherB: "meh" }, { anotherB: 431 }]
                    });

  c.remove({});
  c.insert({a:[[{b:1,c:2},{b:2,c:4}],{b:3,c:5},[{b:4, c:9}]]});

  testForProjection({ 'a.b': 1, _id: 0 },
                    {a: [ [ { b: 1 }, { b: 2 } ], { b: 3 }, [ { b: 4 } ] ] });
  testForProjection({ 'a.b': 0, _id: 0 },
                    {a: [ [ { c: 2 }, { c: 4 } ], { c: 5 }, [ { c: 9 } ] ] });
});

Tinytest.add("minimongo - fetch with projection, deep copy", function (test) {
  // Compiled fields projection defines the contract: returned document doesn't
  // retain anything from the passed argument.
  var doc = {
    a: { x: 42 },
    b: {
      y: { z: 33 }
    },
    c: "asdf"
  };

  var fields = {
    'a': 1,
    'b.y': 1
  };

  var projectionFn = LocalCollection._compileProjection(fields);
  var filteredDoc = projectionFn(doc);
  doc.a.x++;
  doc.b.y.z--;
  test.equal(filteredDoc.a.x, 42, "projection returning deep copy - including");
  test.equal(filteredDoc.b.y.z, 33, "projection returning deep copy - including");

  fields = { c: 0 };
  projectionFn = LocalCollection._compileProjection(fields);
  filteredDoc = projectionFn(doc);

  doc.a.x = 5;
  test.equal(filteredDoc.a.x, 43, "projection returning deep copy - excluding");
});

Tinytest.add("minimongo - observe ordered with projection", function (test) {
  // These tests are copy-paste from "minimongo -observe ordered",
  // slightly modified to test projection
  var operations = [];
  var cbs = log_callbacks(operations);
  var handle;

  var c = new LocalCollection();
  handle = c.find({}, {sort: {a: 1}, fields: { a: 1 }}).observe(cbs);
  test.isTrue(handle.collection === c);

  c.insert({_id: 'foo', a:1, b:2});
  test.equal(operations.shift(), ['added', {a:1}, 0, null]);
  c.update({a:1}, {$set: {a: 2, b: 1}});
  test.equal(operations.shift(), ['changed', {a:2}, 0, {a:1}]);
  c.insert({_id: 'bar', a:10, c: 33});
  test.equal(operations.shift(), ['added', {a:10}, 1, null]);
  c.update({}, {$inc: {a: 1}}, {multi: true});
  c.update({}, {$inc: {c: 1}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, 0, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, 1, {a:10}]);
  c.update({a:11}, {a:1, b:44});
  test.equal(operations.shift(), ['changed', {a:1}, 1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, 1, 0, 'foo']);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', 'foo', 1, {a:3}]);

  // test stop
  handle.stop();
  var idA2 = Random.id();
  c.insert({_id: idA2, a:2});
  test.equal(operations.shift(), undefined);

  var cursor = c.find({}, {fields: {a: 1, _id: 0}});
  test.throws(function () {
    cursor.observeChanges({added: function () {}});
  });
  test.throws(function () {
    cursor.observe({added: function () {}});
  });

  // test initial inserts (and backwards sort)
  handle = c.find({}, {sort: {a: -1}, fields: { a: 1 } }).observe(cbs);
  test.equal(operations.shift(), ['added', {a:2}, 0, null]);
  test.equal(operations.shift(), ['added', {a:1}, 1, null]);
  handle.stop();

  // test _suppress_initial
  handle = c.find({}, {sort: {a: -1}, fields: { a: 1 }}).observe(_.extend(cbs, {_suppress_initial: true}));
  test.equal(operations.shift(), undefined);
  c.insert({a:100, b: { foo: "bar" }});
  test.equal(operations.shift(), ['added', {a:100}, 0, idA2]);
  handle.stop();

  // test skip and limit.
  c.remove({});
  handle = c.find({}, {sort: {a: 1}, skip: 1, limit: 2, fields: { 'blacklisted': 0 }}).observe(cbs);
  test.equal(operations.shift(), undefined);
  c.insert({a:1, blacklisted:1324});
  test.equal(operations.shift(), undefined);
  c.insert({_id: 'foo', a:2, blacklisted:["something"]});
  test.equal(operations.shift(), ['added', {a:2}, 0, null]);
  c.insert({a:3, blacklisted: { 2: 3 }});
  test.equal(operations.shift(), ['added', {a:3}, 1, null]);
  c.insert({a:4, blacklisted: 6});
  test.equal(operations.shift(), undefined);
  c.update({a:1}, {a:0, blacklisted:4444});
  test.equal(operations.shift(), undefined);
  c.update({a:0}, {a:5, blacklisted:11111});
  test.equal(operations.shift(), ['removed', 'foo', 0, {a:2}]);
  test.equal(operations.shift(), ['added', {a:4}, 1, null]);
  c.update({a:3}, {a:3.5, blacklisted:333.4444});
  test.equal(operations.shift(), ['changed', {a:3.5}, 0, {a:3}]);
  handle.stop();

  // test _no_indices

  c.remove({});
  handle = c.find({}, {sort: {a: 1}, fields: { a: 1 }}).observe(_.extend(cbs, {_no_indices: true}));
  c.insert({_id: 'foo', a:1, zoo: "crazy"});
  test.equal(operations.shift(), ['added', {a:1}, -1, null]);
  c.update({a:1}, {$set: {a: 2, foobar: "player"}});
  test.equal(operations.shift(), ['changed', {a:2}, -1, {a:1}]);
  c.insert({a:10, b:123.45});
  test.equal(operations.shift(), ['added', {a:10}, -1, null]);
  c.update({}, {$inc: {a: 1, b:2}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, -1, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, -1, {a:10}]);
  c.update({a:11, b:125.45}, {a:1, b:444});
  test.equal(operations.shift(), ['changed', {a:1}, -1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, -1, -1, 'foo']);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', 'foo', -1, {a:3}]);
  handle.stop();
});


Tinytest.add("minimongo - ordering", function (test) {
  var shortBinary = EJSON.newBinary(1);
  shortBinary[0] = 128;
  var longBinary1 = EJSON.newBinary(2);
  longBinary1[1] = 42;
  var longBinary2 = EJSON.newBinary(2);
  longBinary2[1] = 50;

  var date1 = new Date;
  var date2 = new Date(date1.getTime() + 1000);

  // value ordering
  assert_ordering(test, LocalCollection._f._cmp, [
    null,
    1, 2.2, 3,
    "03", "1", "11", "2", "a", "aaa",
    {}, {a: 2}, {a: 3}, {a: 3, b: 4}, {b: 4}, {b: 4, a: 3},
    {b: {}}, {b: [1, 2, 3]}, {b: [1, 2, 4]},
    [], [1, 2], [1, 2, 3], [1, 2, 4], [1, 2, "4"], [1, 2, [4]],
    shortBinary, longBinary1, longBinary2,
    new LocalCollection._ObjectID("1234567890abcd1234567890"),
    new LocalCollection._ObjectID("abcd1234567890abcd123456"),
    false, true,
    date1, date2
  ]);

  // document ordering under a sort specification
  var verify = function (sorts, docs) {
    _.each(_.isArray(sorts) ? sorts : [sorts], function (sort) {
      var sorter = new Minimongo.Sorter(sort);
      assert_ordering(test, sorter.getComparator(), docs);
    });
  };

  // note: [] doesn't sort with "arrays", it sorts as "undefined". the position
  // of arrays in _typeorder only matters for things like $lt. (This behavior
  // verified with MongoDB 2.2.1.) We don't define the relative order of {a: []}
  // and {c: 1} is undefined (MongoDB does seem to care but it's not clear how
  // or why).
  verify([{"a" : 1}, ["a"], [["a", "asc"]]],
         [{a: []}, {a: 1}, {a: {}}, {a: true}]);
  verify([{"a" : 1}, ["a"], [["a", "asc"]]],
         [{c: 1}, {a: 1}, {a: {}}, {a: true}]);
  verify([{"a" : -1}, [["a", "desc"]]],
         [{a: true}, {a: {}}, {a: 1}, {c: 1}]);
  verify([{"a" : -1}, [["a", "desc"]]],
         [{a: true}, {a: {}}, {a: 1}, {a: []}]);

  verify([{"a" : 1, "b": -1}, ["a", ["b", "desc"]],
          [["a", "asc"], ["b", "desc"]]],
         [{c: 1}, {a: 1, b: 3}, {a: 1, b: 2}, {a: 2, b: 0}]);

  verify([{"a" : 1, "b": 1}, ["a", "b"],
          [["a", "asc"], ["b", "asc"]]],
         [{c: 1}, {a: 1, b: 2}, {a: 1, b: 3}, {a: 2, b: 0}]);

  test.throws(function () {
    new Minimongo.Sorter("a");
  });

  test.throws(function () {
    new Minimongo.Sorter(123);
  });

  // We don't support $natural:1 (since we don't actually have Mongo's on-disk
  // ordering available!)
  test.throws(function () {
    new Minimongo.Sorter({$natural: 1});
  });

  // No sort spec implies everything equal.
  test.equal(new Minimongo.Sorter({}).getComparator()({a:1}, {a:2}), 0);

  // All sorts of array edge cases!
  // Increasing sort sorts by the smallest element it finds; 1 < 2.
  verify({a: 1}, [
    {a: [1, 10, 20]},
    {a: [5, 2, 99]}
  ]);
  // Decreasing sorts by largest it finds; 99 > 20.
  verify({a: -1}, [
    {a: [5, 2, 99]},
    {a: [1, 10, 20]}
  ]);
  // Can also sort by specific array indices.
  verify({'a.1': 1}, [
    {a: [5, 2, 99]},
    {a: [1, 10, 20]}
  ]);
  // We do NOT expand sub-arrays, so the minimum in the second doc is 5, not
  // -20. (Numbers always sort before arrays.)
  verify({a: 1}, [
    {a: [1, [10, 15], 20]},
    {a: [5, [-5, -20], 18]}
  ]);
  // The maximum in each of these is the array, since arrays are "greater" than
  // numbers. And [10, 15] is greater than [-5, -20].
  verify({a: -1}, [
    {a: [1, [10, 15], 20]},
    {a: [5, [-5, -20], 18]}
  ]);
  // 'a.0' here ONLY means "first element of a", not "first element of something
  // found in a", so it CANNOT find the 10 or -5.
  verify({'a.0': 1}, [
    {a: [1, [10, 15], 20]},
    {a: [5, [-5, -20], 18]}
  ]);
  verify({'a.0': -1}, [
    {a: [5, [-5, -20], 18]},
    {a: [1, [10, 15], 20]}
  ]);
  // Similarly, this is just comparing [-5,-20] to [10, 15].
  verify({'a.1': 1}, [
    {a: [5, [-5, -20], 18]},
    {a: [1, [10, 15], 20]}
  ]);
  verify({'a.1': -1}, [
    {a: [1, [10, 15], 20]},
    {a: [5, [-5, -20], 18]}
  ]);
  // Here we are just comparing [10,15] directly to [19,3] (and NOT also
  // iterating over the numbers; this is implemented by setting dontIterate in
  // makeLookupFunction).  So [10,15]<[19,3] even though 3 is the smallest
  // number you can find there.
  verify({'a.1': 1}, [
    {a: [1, [10, 15], 20]},
    {a: [5, [19, 3], 18]}
  ]);
  verify({'a.1': -1}, [
    {a: [5, [19, 3], 18]},
    {a: [1, [10, 15], 20]}
  ]);
  // Minimal elements are 1 and 5.
  verify({a: 1}, [
    {a: [1, [10, 15], 20]},
    {a: [5, [19, 3], 18]}
  ]);
  // Maximal elements are [19,3] and [10,15] (because arrays sort higher than
  // numbers), even though there's a 20 floating around.
  verify({a: -1}, [
    {a: [5, [19, 3], 18]},
    {a: [1, [10, 15], 20]}
  ]);
  // Maximal elements are [10,15] and [3,19].  [10,15] is bigger even though 19
  // is the biggest number in them, because array comparison is lexicographic.
  verify({a: -1}, [
    {a: [1, [10, 15], 20]},
    {a: [5, [3, 19], 18]}
  ]);

  // (0,4) < (0,5), so they go in this order.  It's not correct to consider
  // (0,3) as a sort key for the second document because they come from
  // different a-branches.
  verify({'a.x': 1, 'a.y': 1}, [
    {a: [{x: 0, y: 4}]},
    {a: [{x: 0, y: 5}, {x: 1, y: 3}]}
  ]);

  verify({'a.0.s': 1}, [
    {a: [ {s: 1} ]},
    {a: [ {s: 2} ]}
  ]);
});

Tinytest.add("minimongo - sort", function (test) {
  var c = new LocalCollection();
  for (var i = 0; i < 50; i++)
    for (var j = 0; j < 2; j++)
      c.insert({a: i, b: j, _id: i + "_" + j});

  test.equal(
    c.find({a: {$gt: 10}}, {sort: {b: -1, a: 1}, limit: 5}).fetch(), [
      {a: 11, b: 1, _id: "11_1"},
      {a: 12, b: 1, _id: "12_1"},
      {a: 13, b: 1, _id: "13_1"},
      {a: 14, b: 1, _id: "14_1"},
      {a: 15, b: 1, _id: "15_1"}]);

  test.equal(
    c.find({a: {$gt: 10}}, {sort: {b: -1, a: 1}, skip: 3, limit: 5}).fetch(), [
      {a: 14, b: 1, _id: "14_1"},
      {a: 15, b: 1, _id: "15_1"},
      {a: 16, b: 1, _id: "16_1"},
      {a: 17, b: 1, _id: "17_1"},
      {a: 18, b: 1, _id: "18_1"}]);

  test.equal(
    c.find({a: {$gte: 20}}, {sort: {a: 1, b: -1}, skip: 50, limit: 5}).fetch(), [
      {a: 45, b: 1, _id: "45_1"},
      {a: 45, b: 0, _id: "45_0"},
      {a: 46, b: 1, _id: "46_1"},
      {a: 46, b: 0, _id: "46_0"},
      {a: 47, b: 1, _id: "47_1"}]);
});

Tinytest.add("minimongo - subkey sort", function (test) {
  var c = new LocalCollection();

  // normal case
  c.insert({a: {b: 2}});
  c.insert({a: {b: 1}});
  c.insert({a: {b: 3}});
  test.equal(
    _.pluck(c.find({}, {sort: {'a.b': -1}}).fetch(), 'a'),
    [{b: 3}, {b: 2}, {b: 1}]);

  // isn't an object
  c.insert({a: 1});
  test.equal(
    _.pluck(c.find({}, {sort: {'a.b': 1}}).fetch(), 'a'),
    [1, {b: 1}, {b: 2}, {b: 3}]);

  // complex object
  c.insert({a: {b: {c: 1}}});
  test.equal(
    _.pluck(c.find({}, {sort: {'a.b': -1}}).fetch(), 'a'),
    [{b: {c: 1}}, {b: 3}, {b: 2}, {b: 1}, 1]);

  // no such top level prop
  c.insert({c: 1});
  test.equal(
    _.pluck(c.find({}, {sort: {'a.b': -1}}).fetch(), 'a'),
    [{b: {c: 1}}, {b: 3}, {b: 2}, {b: 1}, 1, undefined]);

  // no such mid level prop. just test that it doesn't throw.
  test.equal(c.find({}, {sort: {'a.nope.c': -1}}).count(), 6);
});

Tinytest.add("minimongo - array sort", function (test) {
  var c = new LocalCollection();

  // "up" and "down" are the indices that the docs should have when sorted
  // ascending and descending by "a.x" respectively. They are not reverses of
  // each other: when sorting ascending, you use the minimum value you can find
  // in the document, and when sorting descending, you use the maximum value you
  // can find. So [1, 4] shows up in the 1 slot when sorting ascending and the 4
  // slot when sorting descending.
  //
  // Similarly, "selected" is the index that the doc should have in the query
  // that sorts ascending on "a.x" and selects {'a.x': {$gt: 1}}. In this case,
  // the 1 in [1, 4] may not be used as a sort key.
  c.insert({up: 1, down: 1, selected: 2, a: {x: [1, 4]}});
  c.insert({up: 2, down: 2, selected: 0, a: [{x: [2]}, {x: 3}]});
  c.insert({up: 0, down: 4,              a: {x: 0}});
  c.insert({up: 3, down: 3, selected: 1, a: {x: 2.5}});
  c.insert({up: 4, down: 0, selected: 3, a: {x: 5}});

  // Test that the the documents in "cursor" contain values with the name
  // "field" running from 0 to the max value of that name in the collection.
  var testCursorMatchesField = function (cursor, field) {
    var fieldValues = [];
    c.find().forEach(function (doc) {
      if (_.has(doc, field))
        fieldValues.push(doc[field]);
    });
    test.equal(_.pluck(cursor.fetch(), field),
               _.range(_.max(fieldValues) + 1));
  };

  testCursorMatchesField(c.find({}, {sort: {'a.x': 1}}), 'up');
  testCursorMatchesField(c.find({}, {sort: {'a.x': -1}}), 'down');
  testCursorMatchesField(c.find({'a.x': {$gt: 1}}, {sort: {'a.x': 1}}),
                         'selected');
});

Tinytest.add("minimongo - sort keys", function (test) {
  var keyListToObject = function (keyList) {
    var obj = {};
    _.each(keyList, function (key) {
      obj[EJSON.stringify(key)] = true;
    });
    return obj;
  };

  var testKeys = function (sortSpec, doc, expectedKeyList) {
    var expectedKeys = keyListToObject(expectedKeyList);
    var sorter = new Minimongo.Sorter(sortSpec);

    var actualKeyList = [];
    sorter._generateKeysFromDoc(doc, function (key) {
      actualKeyList.push(key);
    });
    var actualKeys = keyListToObject(actualKeyList);
    test.equal(actualKeys, expectedKeys);
  };

  var testParallelError = function (sortSpec, doc) {
    var sorter = new Minimongo.Sorter(sortSpec);
    test.throws(function () {
      sorter._generateKeysFromDoc(doc, function (){});
    }, /parallel arrays/);
  };

  // Just non-array fields.
  testKeys({'a.x': 1, 'a.y': 1},
           {a: {x: 0, y: 5}},
           [[0,5]]);

  // Ensure that we don't get [0,3] and [1,5].
  testKeys({'a.x': 1, 'a.y': 1},
           {a: [{x: 0, y: 5}, {x: 1, y: 3}]},
           [[0,5], [1,3]]);

  // Ensure we can combine "array fields" with "non-array fields".
  testKeys({'a.x': 1, 'a.y': 1, b: -1},
           {a: [{x: 0, y: 5}, {x: 1, y: 3}], b: 42},
           [[0,5,42], [1,3,42]]);
  testKeys({b: -1, 'a.x': 1, 'a.y': 1},
           {a: [{x: 0, y: 5}, {x: 1, y: 3}], b: 42},
           [[42,0,5], [42,1,3]]);
  testKeys({'a.x': 1, b: -1, 'a.y': 1},
           {a: [{x: 0, y: 5}, {x: 1, y: 3}], b: 42},
           [[0,42,5], [1,42,3]]);
  testKeys({a: 1, b: 1},
           {a: [1, 2, 3], b: 42},
           [[1,42], [2,42], [3,42]]);

  // Don't support multiple arrays at the same level.
  testParallelError({a: 1, b: 1},
                    {a: [1, 2, 3], b: [42]});

  // We are MORE STRICT than Mongo here; Mongo supports this!
  // XXX support this too  #NestedArraySort
  testParallelError({'a.x': 1, 'a.y': 1},
                    {a: [{x: 1, y: [2, 3]},
                         {x: 2, y: [4, 5]}]});
});

Tinytest.add("minimongo - sort key filter", function (test) {
  var testOrder = function (sortSpec, selector, doc1, doc2) {
    var matcher = new Minimongo.Matcher(selector);
    var sorter = new Minimongo.Sorter(sortSpec, {matcher: matcher});
    var comparator = sorter.getComparator();
    var comparison = comparator(doc1, doc2);
    test.isTrue(comparison < 0);
  };

  testOrder({'a.x': 1}, {'a.x': {$gt: 1}},
            {a: {x: 3}},
            {a: {x: [1, 4]}});
  testOrder({'a.x': 1}, {'a.x': {$gt: 0}},
            {a: {x: [1, 4]}},
            {a: {x: 3}});

  var keyCompatible = function (sortSpec, selector, key, compatible) {
    var matcher = new Minimongo.Matcher(selector);
    var sorter = new Minimongo.Sorter(sortSpec, {matcher: matcher});
    var actual = sorter._keyCompatibleWithSelector(key);
    test.equal(actual, compatible);
  };

  keyCompatible({a: 1}, {a: 5}, [5], true);
  keyCompatible({a: 1}, {a: 5}, [8], false);
  keyCompatible({a: 1}, {a: {x: 5}}, [{x: 5}], true);
  keyCompatible({a: 1}, {a: {x: 5}}, [{x: 5, y: 9}], false);
  keyCompatible({'a.x': 1}, {a: {x: 5}}, [5], true);
  // To confirm this:
  //   > db.x.insert({_id: "q", a: [{x:1}, {x:5}], b: 2})
  //   > db.x.insert({_id: "w", a: [{x:5}, {x:10}], b: 1})
  //   > db.x.find({}).sort({'a.x': 1, b: 1})
  //   { "_id" : "q", "a" : [  {  "x" : 1 },  {  "x" : 5 } ], "b" : 2 }
  //   { "_id" : "w", "a" : [  {  "x" : 5 },  {  "x" : 10 } ], "b" : 1 }
  //   > db.x.find({a: {x:5}}).sort({'a.x': 1, b: 1})
  //   { "_id" : "q", "a" : [  {  "x" : 1 },  {  "x" : 5 } ], "b" : 2 }
  //   { "_id" : "w", "a" : [  {  "x" : 5 },  {  "x" : 10 } ], "b" : 1 }
  //   > db.x.find({'a.x': 5}).sort({'a.x': 1, b: 1})
  //   { "_id" : "w", "a" : [  {  "x" : 5 },  {  "x" : 10 } ], "b" : 1 }
  //   { "_id" : "q", "a" : [  {  "x" : 1 },  {  "x" : 5 } ], "b" : 2 }
  // ie, only the last one manages to trigger the key compatibility code,
  // not the previous one.  (The "b" sort is necessary because when the key
  // compatibility code *does* kick in, both documents only end up with "5"
  // for the first field as their only sort key, and we need to differentiate
  // somehow...)
  keyCompatible({'a.x': 1}, {a: {x: 5}}, [1], true);
  keyCompatible({'a.x': 1}, {'a.x': 5}, [5], true);
  keyCompatible({'a.x': 1}, {'a.x': 5}, [1], false);

  // Regex key check.
  keyCompatible({a: 1}, {a: /^foo+/}, ['foo'], true);
  keyCompatible({a: 1}, {a: /^foo+/}, ['foooo'], true);
  keyCompatible({a: 1}, {a: /^foo+/}, ['foooobar'], true);
  keyCompatible({a: 1}, {a: /^foo+/}, ['afoooo'], false);
  keyCompatible({a: 1}, {a: /^foo+/}, [''], false);
  keyCompatible({a: 1}, {a: {$regex: "^foo+"}}, ['foo'], true);
  keyCompatible({a: 1}, {a: {$regex: "^foo+"}}, ['foooo'], true);
  keyCompatible({a: 1}, {a: {$regex: "^foo+"}}, ['foooobar'], true);
  keyCompatible({a: 1}, {a: {$regex: "^foo+"}}, ['afoooo'], false);
  keyCompatible({a: 1}, {a: {$regex: "^foo+"}}, [''], false);

  keyCompatible({a: 1}, {a: /^foo+/i}, ['foo'], true);
  // Key compatibility check appears to be turned off for regexps with flags.
  keyCompatible({a: 1}, {a: /^foo+/i}, ['bar'], true);
  keyCompatible({a: 1}, {a: /^foo+/m}, ['bar'], true);
  keyCompatible({a: 1}, {a: {$regex: "^foo+", $options: "i"}}, ['bar'], true);
  keyCompatible({a: 1}, {a: {$regex: "^foo+", $options: "m"}}, ['bar'], true);

  // Multiple keys!
  keyCompatible({a: 1, b: 1, c: 1},
                {a: {$gt: 5}, c: {$lt: 3}}, [6, "bla", 2], true);
  keyCompatible({a: 1, b: 1, c: 1},
                {a: {$gt: 5}, c: {$lt: 3}}, [6, "bla", 4], false);
  keyCompatible({a: 1, b: 1, c: 1},
                {a: {$gt: 5}, c: {$lt: 3}}, [3, "bla", 1], false);
  // No filtering is done (ie, all keys are compatible) if the first key isn't
  // constrained.
  keyCompatible({a: 1, b: 1, c: 1},
                {c: {$lt: 3}}, [3, "bla", 4], true);
});

Tinytest.add("minimongo - binary search", function (test) {
  var forwardCmp = function (a, b) {
    return a - b;
  };

  var backwardCmp = function (a, b) {
    return -1 * forwardCmp(a, b);
  };

  var checkSearch = function (cmp, array, value, expected, message) {
    var actual = LocalCollection._binarySearch(cmp, array, value);
    if (expected != actual) {
      test.fail({type: "minimongo-binary-search",
                 message: message + " : Expected index " + expected +
                 " but had " + actual
      });
    }
  };

  var checkSearchForward = function (array, value, expected, message) {
    checkSearch(forwardCmp, array, value, expected, message);
  };
  var checkSearchBackward = function (array, value, expected, message) {
    checkSearch(backwardCmp, array, value, expected, message);
  };

  checkSearchForward([1, 2, 5, 7], 4, 2, "Inner insert");
  checkSearchForward([1, 2, 3, 4], 3, 3, "Inner insert, equal value");
  checkSearchForward([1, 2, 5], 4, 2, "Inner insert, odd length");
  checkSearchForward([1, 3, 5, 6], 9, 4, "End insert");
  checkSearchForward([1, 3, 5, 6], 0, 0, "Beginning insert");
  checkSearchForward([1], 0, 0, "Single array, less than.");
  checkSearchForward([1], 1, 1, "Single array, equal.");
  checkSearchForward([1], 2, 1, "Single array, greater than.");
  checkSearchForward([], 1, 0, "Empty array");
  checkSearchForward([1, 1, 1, 2, 2, 2, 2], 1, 3, "Highly degenerate array, lower");
  checkSearchForward([1, 1, 1, 2, 2, 2, 2], 2, 7, "Highly degenerate array, upper");
  checkSearchForward([2, 2, 2, 2, 2, 2, 2], 1, 0, "Highly degenerate array, lower");
  checkSearchForward([2, 2, 2, 2, 2, 2, 2], 2, 7, "Highly degenerate array, equal");
  checkSearchForward([2, 2, 2, 2, 2, 2, 2], 3, 7, "Highly degenerate array, upper");

  checkSearchBackward([7, 5, 2, 1], 4, 2, "Backward: Inner insert");
  checkSearchBackward([4, 3, 2, 1], 3, 2, "Backward: Inner insert, equal value");
  checkSearchBackward([5, 2, 1], 4, 1, "Backward: Inner insert, odd length");
  checkSearchBackward([6, 5, 3, 1], 9, 0, "Backward: Beginning insert");
  checkSearchBackward([6, 5, 3, 1], 0, 4, "Backward: End insert");
  checkSearchBackward([1], 0, 1, "Backward: Single array, less than.");
  checkSearchBackward([1], 1, 1, "Backward: Single array, equal.");
  checkSearchBackward([1], 2, 0, "Backward: Single array, greater than.");
  checkSearchBackward([], 1, 0, "Backward: Empty array");
  checkSearchBackward([2, 2, 2, 2, 1, 1, 1], 1, 7, "Backward: Degenerate array, lower");
  checkSearchBackward([2, 2, 2, 2, 1, 1, 1], 2, 4, "Backward: Degenerate array, upper");
  checkSearchBackward([2, 2, 2, 2, 2, 2, 2], 1, 7, "Backward: Highly degenerate array, upper");
  checkSearchBackward([2, 2, 2, 2, 2, 2, 2], 2, 7, "Backward: Highly degenerate array, upper");
  checkSearchBackward([2, 2, 2, 2, 2, 2, 2], 3, 0, "Backward: Highly degenerate array, upper");
});

Tinytest.add("minimongo - modify", function (test) {
  var modifyWithQuery = function (doc, query, mod, expected) {
    var coll = new LocalCollection;
    coll.insert(doc);
    // The query is relevant for 'a.$.b'.
    coll.update(query, mod);
    var actual = coll.findOne();
    delete actual._id;  // added by insert
    test.equal(actual, expected, EJSON.stringify({input: doc, mod: mod}));
  };
  var modify = function (doc, mod, expected) {
    modifyWithQuery(doc, {}, mod, expected);
  };
  var exceptionWithQuery = function (doc, query, mod) {
    var coll = new LocalCollection;
    coll.insert(doc);
    test.throws(function () {
      coll.update(query, mod);
    });
  };
  var exception = function (doc, mod) {
    exceptionWithQuery(doc, {}, mod);
  };

  // document replacement
  modify({}, {}, {});
  modify({a: 12}, {}, {}); // tested against mongodb
  modify({a: 12}, {a: 13}, {a:13});
  modify({a: 12, b: 99}, {a: 13}, {a:13});
  exception({a: 12}, {a: 13, $set: {b: 13}});
  exception({a: 12}, {$set: {b: 13}, a: 13});

  // keys
  modify({}, {$set: {'a': 12}}, {a: 12});
  modify({}, {$set: {'a.b': 12}}, {a: {b: 12}});
  modify({}, {$set: {'a.b.c': 12}}, {a: {b: {c: 12}}});
  modify({a: {d: 99}}, {$set: {'a.b.c': 12}}, {a: {d: 99, b: {c: 12}}});
  modify({}, {$set: {'a.b.3.c': 12}}, {a: {b: {3: {c: 12}}}});
  modify({a: {b: []}}, {$set: {'a.b.3.c': 12}}, {
    a: {b: [null, null, null, {c: 12}]}});
  exception({a: [null, null, null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, 1, null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, "x", null]}, {$set: {'a.1.b': 12}});
  exception({a: [null, [], null]}, {$set: {'a.1.b': 12}});
  modify({a: [null, null, null]}, {$set: {'a.3.b': 12}}, {
    a: [null, null, null, {b: 12}]});
  exception({a: []}, {$set: {'a.b': 12}});
  exception({a: 12}, {$set: {'a.b': 99}}); // tested on mongo
  exception({a: 'x'}, {$set: {'a.b': 99}});
  exception({a: true}, {$set: {'a.b': 99}});
  exception({a: null}, {$set: {'a.b': 99}});
  modify({a: {}}, {$set: {'a.3': 12}}, {a: {'3': 12}});
  modify({a: []}, {$set: {'a.3': 12}}, {a: [null, null, null, 12]});
  exception({}, {$set: {'': 12}}); // tested on mongo
  exception({}, {$set: {'.': 12}}); // tested on mongo
  exception({}, {$set: {'a.': 12}}); // tested on mongo
  exception({}, {$set: {'. ': 12}}); // tested on mongo
  exception({}, {$inc: {'... ': 12}}); // tested on mongo
  exception({}, {$set: {'a..b': 12}}); // tested on mongo
  modify({a: [1,2,3]}, {$set: {'a.01': 99}}, {a: [1, 99, 3]});
  modify({a: [1,{a: 98},3]}, {$set: {'a.01.b': 99}}, {a: [1,{a:98, b: 99},3]});
  modify({}, {$set: {'2.a.b': 12}}, {'2': {'a': {'b': 12}}}); // tested
  exception({x: []}, {$set: {'x.2..a': 99}});
  modify({x: [null, null]}, {$set: {'x.2.a': 1}}, {x: [null, null, {a: 1}]});
  exception({x: [null, null]}, {$set: {'x.1.a': 1}});

  // a.$.b
  modifyWithQuery({a: [{x: 2}, {x: 4}]}, {'a.x': 4}, {$set: {'a.$.z': 9}},
                  {a: [{x: 2}, {x: 4, z: 9}]});
  exception({a: [{x: 2}, {x: 4}]}, {$set: {'a.$.z': 9}});
  exceptionWithQuery({a: [{x: 2}, {x: 4}], b: 5}, {b: 5}, {$set: {'a.$.z': 9}});
  // can't have two $
  exceptionWithQuery({a: [{x: [2]}]}, {'a.x': 2}, {$set: {'a.$.x.$': 9}});
  modifyWithQuery({a: [5, 6, 7]}, {a: 6}, {$set: {'a.$': 9}}, {a: [5, 9, 7]});
  modifyWithQuery({a: [{b: [{c: 9}, {c: 10}]}, {b: {c: 11}}]}, {'a.b.c': 10},
                  {$unset: {'a.$.b': 1}}, {a: [{}, {b: {c: 11}}]});
  modifyWithQuery({a: [{b: [{c: 9}, {c: 10}]}, {b: {c: 11}}]}, {'a.b.c': 11},
                  {$unset: {'a.$.b': 1}},
                  {a: [{b: [{c: 9}, {c: 10}]}, {}]});
  modifyWithQuery({a: [1]}, {'a.0': 1}, {$set: {'a.$': 5}}, {a: [5]});
  modifyWithQuery({a: [9]}, {a: {$mod: [2, 1]}}, {$set: {'a.$': 5}}, {a: [5]});
  // Negatives don't set '$'.
  exceptionWithQuery({a: [1]}, {$not: {a: 2}}, {$set: {'a.$': 5}});
  exceptionWithQuery({a: [1]}, {'a.0': {$ne: 2}}, {$set: {'a.$': 5}});
  // One $or clause works.
  modifyWithQuery({a: [{x: 2}, {x: 4}]},
                  {$or: [{'a.x': 4}]}, {$set: {'a.$.z': 9}},
                  {a: [{x: 2}, {x: 4, z: 9}]});
  // More $or clauses throw.
  exceptionWithQuery({a: [{x: 2}, {x: 4}]},
                     {$or: [{'a.x': 4}, {'a.x': 4}]},
                     {$set: {'a.$.z': 9}});
  // $and uses the last one.
  modifyWithQuery({a: [{x: 1}, {x: 3}]},
                  {$and: [{'a.x': 1}, {'a.x': 3}]},
                  {$set: {'a.$.x': 5}},
                  {a: [{x: 1}, {x: 5}]});
  modifyWithQuery({a: [{x: 1}, {x: 3}]},
                  {$and: [{'a.x': 3}, {'a.x': 1}]},
                  {$set: {'a.$.x': 5}},
                  {a: [{x: 5}, {x: 3}]});
  // Same goes for the implicit AND of a document selector.
  modifyWithQuery({a: [{x: 1}, {y: 3}]},
                  {'a.x': 1, 'a.y': 3},
                  {$set: {'a.$.z': 5}},
                  {a: [{x: 1}, {y: 3, z: 5}]});
  // with $near, make sure it finds the closest one
  modifyWithQuery({a: [{b: [1,1]},
                       {b: [ [3,3], [4,4] ]},
                       {b: [9,9]}]},
                  {'a.b': {$near: [5, 5]}},
                  {$set: {'a.$.b': 'k'}},
                  {a: [{b: [1,1]}, {b: 'k'}, {b: [9,9]}]});
  modifyWithQuery({a: [{x: 1}, {y: 1}, {x: 1, y: 1}]},
                  {a: {$elemMatch: {x: 1, y: 1}}},
                  {$set: {'a.$.x': 2}},
                  {a: [{x: 1}, {y: 1}, {x: 2, y: 1}]});
  modifyWithQuery({a: [{b: [{x: 1}, {y: 1}, {x: 1, y: 1}]}]},
                  {'a.b': {$elemMatch: {x: 1, y: 1}}},
                  {$set: {'a.$.b': 3}},
                  {a: [{b: 3}]});

  // $inc
  modify({a: 1, b: 2}, {$inc: {a: 10}}, {a: 11, b: 2});
  modify({a: 1, b: 2}, {$inc: {c: 10}}, {a: 1, b: 2, c: 10});
  exception({a: 1}, {$inc: {a: '10'}});
  exception({a: 1}, {$inc: {a: true}});
  exception({a: 1}, {$inc: {a: [10]}});
  exception({a: '1'}, {$inc: {a: 10}});
  exception({a: [1]}, {$inc: {a: 10}});
  exception({a: {}}, {$inc: {a: 10}});
  exception({a: false}, {$inc: {a: 10}});
  exception({a: null}, {$inc: {a: 10}});
  modify({a: [1, 2]}, {$inc: {'a.1': 10}}, {a: [1, 12]});
  modify({a: [1, 2]}, {$inc: {'a.2': 10}}, {a: [1, 2, 10]});
  modify({a: [1, 2]}, {$inc: {'a.3': 10}}, {a: [1, 2, null, 10]});
  modify({a: {b: 2}}, {$inc: {'a.b': 10}}, {a: {b: 12}});
  modify({a: {b: 2}}, {$inc: {'a.c': 10}}, {a: {b: 2, c: 10}});
  exception({}, {$inc: {_id: 1}});

  // $set
  modify({a: 1, b: 2}, {$set: {a: 10}}, {a: 10, b: 2});
  modify({a: 1, b: 2}, {$set: {c: 10}}, {a: 1, b: 2, c: 10});
  modify({a: 1, b: 2}, {$set: {a: {c: 10}}}, {a: {c: 10}, b: 2});
  modify({a: [1, 2], b: 2}, {$set: {a: [3, 4]}}, {a: [3, 4], b: 2});
  modify({a: [1, 2, 3], b: 2}, {$set: {'a.1': [3, 4]}},
         {a: [1, [3, 4], 3], b:2});
  modify({a: [1], b: 2}, {$set: {'a.1': 9}}, {a: [1, 9], b: 2});
  modify({a: [1], b: 2}, {$set: {'a.2': 9}}, {a: [1, null, 9], b: 2});
  modify({a: {b: 1}}, {$set: {'a.c': 9}}, {a: {b: 1, c: 9}});
  modify({}, {$set: {'x._id': 4}}, {x: {_id: 4}});
  exception({}, {$set: {_id: 4}});
  exception({_id: 4}, {$set: {_id: 4}});  // even not-changing _id is bad

  // $unset
  modify({}, {$unset: {a: 1}}, {});
  modify({a: 1}, {$unset: {a: 1}}, {});
  modify({a: 1, b: 2}, {$unset: {a: 1}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: 0}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: false}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: null}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: [1]}}, {b: 2});
  modify({a: 1, b: 2}, {$unset: {a: {}}}, {b: 2});
  modify({a: {b: 2, c: 3}}, {$unset: {'a.b': 1}}, {a: {c: 3}});
  modify({a: [1, 2, 3]}, {$unset: {'a.1': 1}}, {a: [1, null, 3]}); // tested
  modify({a: [1, 2, 3]}, {$unset: {'a.2': 1}}, {a: [1, 2, null]}); // tested
  modify({a: [1, 2, 3]}, {$unset: {'a.x': 1}}, {a: [1, 2, 3]}); // tested
  modify({a: {b: 1}}, {$unset: {'a.b.c.d': 1}}, {a: {b: 1}});
  modify({a: {b: 1}}, {$unset: {'a.x.c.d': 1}}, {a: {b: 1}});
  modify({a: {b: {c: 1}}}, {$unset: {'a.b.c': 1}}, {a: {b: {}}});
  exception({}, {$unset: {_id: 1}});

  // $push
  modify({}, {$push: {a: 1}}, {a: [1]});
  modify({a: []}, {$push: {a: 1}}, {a: [1]});
  modify({a: [1]}, {$push: {a: 2}}, {a: [1, 2]});
  exception({a: true}, {$push: {a: 1}});
  modify({a: [1]}, {$push: {a: [2]}}, {a: [1, [2]]});
  modify({a: []}, {$push: {'a.1': 99}}, {a: [null, [99]]}); // tested
  modify({a: {}}, {$push: {'a.x': 99}}, {a: {x: [99]}});
  modify({}, {$push: {a: {$each: [1, 2, 3]}}},
         {a: [1, 2, 3]});
  modify({a: []}, {$push: {a: {$each: [1, 2, 3]}}},
         {a: [1, 2, 3]});
  modify({a: [true]}, {$push: {a: {$each: [1, 2, 3]}}},
         {a: [true, 1, 2, 3]});
  // No positive numbers for $slice
  exception({}, {$push: {a: {$each: [], $slice: 5}}});
  modify({a: [true]}, {$push: {a: {$each: [1, 2, 3], $slice: -2}}},
         {a: [2, 3]});
  modify({a: [false, true]}, {$push: {a: {$each: [1], $slice: -2}}},
         {a: [true, 1]});
  modify(
    {a: [{x: 3}, {x: 1}]},
    {$push: {a: {
      $each: [{x: 4}, {x: 2}],
      $slice: -2,
      $sort: {x: 1}
    }}},
    {a: [{x: 3}, {x: 4}]});
  modify({}, {$push: {a: {$each: [1, 2, 3], $slice: 0}}}, {a: []});
  modify({a: [1, 2]}, {$push: {a: {$each: [1, 2, 3], $slice: 0}}}, {a: []});

  // $pushAll
  modify({}, {$pushAll: {a: [1]}}, {a: [1]});
  modify({a: []}, {$pushAll: {a: [1]}}, {a: [1]});
  modify({a: [1]}, {$pushAll: {a: [2]}}, {a: [1, 2]});
  modify({}, {$pushAll: {a: [1, 2]}}, {a: [1, 2]});
  modify({a: []}, {$pushAll: {a: [1, 2]}}, {a: [1, 2]});
  modify({a: [1]}, {$pushAll: {a: [2, 3]}}, {a: [1, 2, 3]});
  modify({}, {$pushAll: {a: []}}, {a: []});
  modify({a: []}, {$pushAll: {a: []}}, {a: []});
  modify({a: [1]}, {$pushAll: {a: []}}, {a: [1]});
  exception({a: true}, {$pushAll: {a: [1]}});
  exception({a: []}, {$pushAll: {a: 1}});
  modify({a: []}, {$pushAll: {'a.1': [99]}}, {a: [null, [99]]});
  modify({a: []}, {$pushAll: {'a.1': []}}, {a: [null, []]});
  modify({a: {}}, {$pushAll: {'a.x': [99]}}, {a: {x: [99]}});
  modify({a: {}}, {$pushAll: {'a.x': []}}, {a: {x: []}});

  // $addToSet
  modify({}, {$addToSet: {a: 1}}, {a: [1]});
  modify({a: []}, {$addToSet: {a: 1}}, {a: [1]});
  modify({a: [1]}, {$addToSet: {a: 2}}, {a: [1, 2]});
  modify({a: [1, 2]}, {$addToSet: {a: 1}}, {a: [1, 2]});
  modify({a: [1, 2]}, {$addToSet: {a: 2}}, {a: [1, 2]});
  modify({a: [1, 2]}, {$addToSet: {a: 3}}, {a: [1, 2, 3]});
  exception({a: true}, {$addToSet: {a: 1}});
  modify({a: [1]}, {$addToSet: {a: [2]}}, {a: [1, [2]]});
  modify({}, {$addToSet: {a: {x: 1}}}, {a: [{x: 1}]});
  modify({a: [{x: 1}]}, {$addToSet: {a: {x: 1}}}, {a: [{x: 1}]});
  modify({a: [{x: 1}]}, {$addToSet: {a: {x: 2}}}, {a: [{x: 1}, {x: 2}]});
  modify({a: [{x: 1, y: 2}]}, {$addToSet: {a: {x: 1, y: 2}}},
         {a: [{x: 1, y: 2}]});
  modify({a: [{x: 1, y: 2}]}, {$addToSet: {a: {y: 2, x: 1}}},
         {a: [{x: 1, y: 2}, {y: 2, x: 1}]});
  modify({a: [1, 2]}, {$addToSet: {a: {$each: [3, 1, 4]}}}, {a: [1, 2, 3, 4]});
  modify({a: [1, 2]}, {$addToSet: {a: {$each: [3, 1, 4], b: 12}}},
         {a: [1, 2, 3, 4]}); // tested
  modify({a: [1, 2]}, {$addToSet: {a: {b: 12, $each: [3, 1, 4]}}},
         {a: [1, 2, {b: 12, $each: [3, 1, 4]}]}); // tested
  modify({}, {$addToSet: {a: {$each: []}}}, {a: []});
  modify({}, {$addToSet: {a: {$each: [1]}}}, {a: [1]});
  modify({a: []}, {$addToSet: {'a.1': 99}}, {a: [null, [99]]});
  modify({a: {}}, {$addToSet: {'a.x': 99}}, {a: {x: [99]}});

  // $pop
  modify({}, {$pop: {a: 1}}, {}); // tested
  modify({}, {$pop: {a: -1}}, {}); // tested
  modify({a: []}, {$pop: {a: 1}}, {a: []});
  modify({a: []}, {$pop: {a: -1}}, {a: []});
  modify({a: [1, 2, 3]}, {$pop: {a: 1}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: 10}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: .001}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: 0}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: "stuff"}}, {a: [1, 2]});
  modify({a: [1, 2, 3]}, {$pop: {a: -1}}, {a: [2, 3]});
  modify({a: [1, 2, 3]}, {$pop: {a: -10}}, {a: [2, 3]});
  modify({a: [1, 2, 3]}, {$pop: {a: -.001}}, {a: [2, 3]});
  exception({a: true}, {$pop: {a: 1}});
  exception({a: true}, {$pop: {a: -1}});
  modify({a: []}, {$pop: {'a.1': 1}}, {a: []}); // tested
  modify({a: [1, [2, 3], 4]}, {$pop: {'a.1': 1}}, {a: [1, [2], 4]});
  modify({a: {}}, {$pop: {'a.x': 1}}, {a: {}}); // tested
  modify({a: {x: [2, 3]}}, {$pop: {'a.x': 1}}, {a: {x: [2]}});

  // $pull
  modify({}, {$pull: {a: 1}}, {});
  modify({}, {$pull: {'a.x': 1}}, {});
  modify({a: {}}, {$pull: {'a.x': 1}}, {a: {}});
  exception({a: true}, {$pull: {a: 1}});
  modify({a: [2, 1, 2]}, {$pull: {a: 1}}, {a: [2, 2]});
  modify({a: [2, 1, 2]}, {$pull: {a: 2}}, {a: [1]});
  modify({a: [2, 1, 2]}, {$pull: {a: 3}}, {a: [2, 1, 2]});
  modify({a: []}, {$pull: {a: 3}}, {a: []});
  modify({a: [[2], [2, 1], [3]]}, {$pull: {a: [2, 1]}},
         {a: [[2], [3]]}); // tested
  modify({a: [{b: 1, c: 2}, {b: 2, c: 2}]}, {$pull: {a: {b: 1}}},
         {a: [{b: 2, c: 2}]});
  modify({a: [{b: 1, c: 2}, {b: 2, c: 2}]}, {$pull: {a: {c: 2}}},
         {a: []});
  // XXX implement this functionality!
  // probably same refactoring as $elemMatch?
  // modify({a: [1, 2, 3, 4]}, {$pull: {$gt: 2}}, {a: [1,2]}); fails!

  // $pullAll
  modify({}, {$pullAll: {a: [1]}}, {});
  modify({a: [1, 2, 3]}, {$pullAll: {a: []}}, {a: [1, 2, 3]});
  modify({a: [1, 2, 3]}, {$pullAll: {a: [2]}}, {a: [1, 3]});
  modify({a: [1, 2, 3]}, {$pullAll: {a: [2, 1]}}, {a: [3]});
  modify({a: [1, 2, 3]}, {$pullAll: {a: [1, 2]}}, {a: [3]});
  modify({}, {$pullAll: {'a.b.c': [2]}}, {});
  exception({a: true}, {$pullAll: {a: [1]}});
  exception({a: [1, 2, 3]}, {$pullAll: {a: 1}});
  modify({x: [{a: 1}, {a: 1, b: 2}]}, {$pullAll: {x: [{a: 1}]}},
         {x: [{a: 1, b: 2}]});

  // $rename
  modify({}, {$rename: {a: 'b'}}, {});
  modify({a: [12]}, {$rename: {a: 'b'}}, {b: [12]});
  modify({a: {b: 12}}, {$rename: {a: 'c'}}, {c: {b: 12}});
  modify({a: {b: 12}}, {$rename: {'a.b': 'a.c'}}, {a: {c: 12}});
  modify({a: {b: 12}}, {$rename: {'a.b': 'x'}}, {a: {}, x: 12}); // tested
  modify({a: {b: 12}}, {$rename: {'a.b': 'q.r'}}, {a: {}, q: {r: 12}});
  modify({a: {b: 12}}, {$rename: {'a.b': 'q.2.r'}}, {a: {}, q: {2: {r: 12}}});
  modify({a: {b: 12}, q: {}}, {$rename: {'a.b': 'q.2.r'}},
         {a: {}, q: {2: {r: 12}}});
  exception({a: {b: 12}, q: []}, {$rename: {'a.b': 'q.2'}}); // tested
  exception({a: {b: 12}, q: []}, {$rename: {'a.b': 'q.2.r'}}); // tested
  // These strange MongoDB behaviors throw.
  // modify({a: {b: 12}, q: []}, {$rename: {'q.1': 'x'}},
  //        {a: {b: 12}, x: []}); // tested
  // modify({a: {b: 12}, q: []}, {$rename: {'q.1.j': 'x'}},
  //        {a: {b: 12}, x: []}); // tested
  exception({}, {$rename: {'a': 'a'}});
  exception({}, {$rename: {'a.b': 'a.b'}});
  modify({a: 12, b: 13}, {$rename: {a: 'b'}}, {b: 12});

  // $bit
  // unimplemented

  // XXX test case sensitivity of modops
  // XXX for each (most) modop, test that it performs a deep copy
});

// XXX test update() (selecting docs, multi, upsert..)

Tinytest.add("minimongo - observe ordered", function (test) {
  var operations = [];
  var cbs = log_callbacks(operations);
  var handle;

  var c = new LocalCollection();
  handle = c.find({}, {sort: {a: 1}}).observe(cbs);
  test.isTrue(handle.collection === c);

  c.insert({_id: 'foo', a:1});
  test.equal(operations.shift(), ['added', {a:1}, 0, null]);
  c.update({a:1}, {$set: {a: 2}});
  test.equal(operations.shift(), ['changed', {a:2}, 0, {a:1}]);
  c.insert({a:10});
  test.equal(operations.shift(), ['added', {a:10}, 1, null]);
  c.update({}, {$inc: {a: 1}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, 0, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, 1, {a:10}]);
  c.update({a:11}, {a:1});
  test.equal(operations.shift(), ['changed', {a:1}, 1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, 1, 0, 'foo']);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', 'foo', 1, {a:3}]);

  // test stop
  handle.stop();
  var idA2 = Random.id();
  c.insert({_id: idA2, a:2});
  test.equal(operations.shift(), undefined);

  // test initial inserts (and backwards sort)
  handle = c.find({}, {sort: {a: -1}}).observe(cbs);
  test.equal(operations.shift(), ['added', {a:2}, 0, null]);
  test.equal(operations.shift(), ['added', {a:1}, 1, null]);
  handle.stop();

  // test _suppress_initial
  handle = c.find({}, {sort: {a: -1}}).observe(_.extend({
    _suppress_initial: true}, cbs));
  test.equal(operations.shift(), undefined);
  c.insert({a:100});
  test.equal(operations.shift(), ['added', {a:100}, 0, idA2]);
  handle.stop();

  // test skip and limit.
  c.remove({});
  handle = c.find({}, {sort: {a: 1}, skip: 1, limit: 2}).observe(cbs);
  test.equal(operations.shift(), undefined);
  c.insert({a:1});
  test.equal(operations.shift(), undefined);
  c.insert({_id: 'foo', a:2});
  test.equal(operations.shift(), ['added', {a:2}, 0, null]);
  c.insert({a:3});
  test.equal(operations.shift(), ['added', {a:3}, 1, null]);
  c.insert({a:4});
  test.equal(operations.shift(), undefined);
  c.update({a:1}, {a:0});
  test.equal(operations.shift(), undefined);
  c.update({a:0}, {a:5});
  test.equal(operations.shift(), ['removed', 'foo', 0, {a:2}]);
  test.equal(operations.shift(), ['added', {a:4}, 1, null]);
  c.update({a:3}, {a:3.5});
  test.equal(operations.shift(), ['changed', {a:3.5}, 0, {a:3}]);
  handle.stop();

  // test observe limit with pre-existing docs
  c.remove({});
  c.insert({a: 1});
  c.insert({_id: 'two', a: 2});
  c.insert({a: 3});
  handle = c.find({}, {sort: {a: 1}, limit: 2}).observe(cbs);
  test.equal(operations.shift(), ['added', {a:1}, 0, null]);
  test.equal(operations.shift(), ['added', {a:2}, 1, null]);
  test.equal(operations.shift(), undefined);
  c.remove({a: 2});
  test.equal(operations.shift(), ['removed', 'two', 1, {a:2}]);
  test.equal(operations.shift(), ['added', {a:3}, 1, null]);
  test.equal(operations.shift(), undefined);
  handle.stop();

  // test _no_indices

  c.remove({});
  handle = c.find({}, {sort: {a: 1}}).observe(_.extend(cbs, {_no_indices: true}));
  c.insert({_id: 'foo', a:1});
  test.equal(operations.shift(), ['added', {a:1}, -1, null]);
  c.update({a:1}, {$set: {a: 2}});
  test.equal(operations.shift(), ['changed', {a:2}, -1, {a:1}]);
  c.insert({a:10});
  test.equal(operations.shift(), ['added', {a:10}, -1, null]);
  c.update({}, {$inc: {a: 1}}, {multi: true});
  test.equal(operations.shift(), ['changed', {a:3}, -1, {a:2}]);
  test.equal(operations.shift(), ['changed', {a:11}, -1, {a:10}]);
  c.update({a:11}, {a:1});
  test.equal(operations.shift(), ['changed', {a:1}, -1, {a:11}]);
  test.equal(operations.shift(), ['moved', {a:1}, -1, -1, 'foo']);
  c.remove({a:2});
  test.equal(operations.shift(), undefined);
  c.remove({a:3});
  test.equal(operations.shift(), ['removed', 'foo', -1, {a:3}]);
  handle.stop();
});

_.each([true, false], function (ordered) {
  Tinytest.add("minimongo - observe ordered: " + ordered, function (test) {
    var c = new LocalCollection();

    var ev = "";
    var makecb = function (tag) {
      var ret = {};
      _.each(["added", "changed", "removed"], function (fn) {
        var fnName = ordered ? fn + "At" : fn;
        ret[fnName] = function (doc) {
          ev = (ev + fn.substr(0, 1) + tag + doc._id + "_");
        };
      });
      return ret;
    };
    var expect = function (x) {
      test.equal(ev, x);
      ev = "";
    };

    c.insert({_id: 1, name: "strawberry", tags: ["fruit", "red", "squishy"]});
    c.insert({_id: 2, name: "apple", tags: ["fruit", "red", "hard"]});
    c.insert({_id: 3, name: "rose", tags: ["flower", "red", "squishy"]});

    // This should work equally well for ordered and unordered observations
    // (because the callbacks don't look at indices and there's no 'moved'
    // callback).
    var handle = c.find({tags: "flower"}).observe(makecb('a'));
    expect("aa3_");
    c.update({name: "rose"}, {$set: {tags: ["bloom", "red", "squishy"]}});
    expect("ra3_");
    c.update({name: "rose"}, {$set: {tags: ["flower", "red", "squishy"]}});
    expect("aa3_");
    c.update({name: "rose"}, {$set: {food: false}});
    expect("ca3_");
    c.remove({});
    expect("ra3_");
    c.insert({_id: 4, name: "daisy", tags: ["flower"]});
    expect("aa4_");
    handle.stop();
    // After calling stop, no more callbacks are called.
    c.insert({_id: 5, name: "iris", tags: ["flower"]});
    expect("");

    // Test that observing a lookup by ID works.
    handle = c.find(4).observe(makecb('b'));
    expect('ab4_');
    c.update(4, {$set: {eek: 5}});
    expect('cb4_');
    handle.stop();

    // Test observe with reactive: false.
    handle = c.find({tags: "flower"}, {reactive: false}).observe(makecb('c'));
    expect('ac4_ac5_');
    // This insert shouldn't trigger a callback because it's not reactive.
    c.insert({_id: 6, name: "river", tags: ["flower"]});
    expect('');
    handle.stop();
  });
});


Tinytest.add("minimongo - diff changes ordering", function (test) {
  var makeDocs = function (ids) {
    return _.map(ids, function (id) { return {_id: id};});
  };
  var testMutation = function (a, b) {
    var aa = makeDocs(a);
    var bb = makeDocs(b);
    var aaCopy = EJSON.clone(aa);
    LocalCollection._diffQueryOrderedChanges(aa, bb, {

      addedBefore: function (id, doc, before) {
        if (before === null) {
          aaCopy.push( _.extend({_id: id}, doc));
          return;
        }
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === before) {
            aaCopy.splice(i, 0, _.extend({_id: id}, doc));
            return;
          }
        }
      },
      movedBefore: function (id, before) {
        var found;
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === id) {
            found = aaCopy[i];
            aaCopy.splice(i, 1);
          }
        }
        if (before === null) {
          aaCopy.push( _.extend({_id: id}, found));
          return;
        }
        for (i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === before) {
            aaCopy.splice(i, 0, _.extend({_id: id}, found));
            return;
          }
        }
      },
      removed: function (id) {
        var found;
        for (var i = 0; i < aaCopy.length; i++) {
          if (aaCopy[i]._id === id) {
            found = aaCopy[i];
            aaCopy.splice(i, 1);
          }
        }
      }
    });
    test.equal(aaCopy, bb);
  };

  var testBothWays = function (a, b) {
    testMutation(a, b);
    testMutation(b, a);
  };

  testBothWays(["a", "b", "c"], ["c", "b", "a"]);
  testBothWays(["a", "b", "c"], []);
  testBothWays(["a", "b", "c"], ["e","f"]);
  testBothWays(["a", "b", "c", "d"], ["c", "b", "a"]);
  testBothWays(['A','B','C','D','E','F','G','H','I'],
               ['A','B','F','G','C','D','I','L','M','N','H']);
  testBothWays(['A','B','C','D','E','F','G','H','I'],['A','B','C','D','F','G','H','E','I']);
});

Tinytest.add("minimongo - diff", function (test) {

  // test correctness

  var diffTest = function(origLen, newOldIdx) {
    var oldResults = new Array(origLen);
    for (var i = 1; i <= origLen; i++)
      oldResults[i-1] = {_id: i};

    var newResults = _.map(newOldIdx, function(n) {
      var doc = {_id: Math.abs(n)};
      if (n < 0)
        doc.changed = true;
      return doc;
    });
    var find = function (arr, id) {
      for (var i = 0; i < arr.length; i++) {
        if (EJSON.equals(arr[i]._id, id))
          return i;
      }
      return -1;
    };

    var results = _.clone(oldResults);
    var observer = {
      addedBefore: function(id, fields, before) {
        var before_idx;
        if (before === null)
          before_idx = results.length;
        else
          before_idx = find (results, before);
        var doc = _.extend({_id: id}, fields);
        test.isFalse(before_idx < 0 || before_idx > results.length);
        results.splice(before_idx, 0, doc);
      },
      removed: function(id) {
        var at_idx = find (results, id);
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        results.splice(at_idx, 1);
      },
      changed: function(id, fields) {
        var at_idx = find (results, id);
        var oldDoc = results[at_idx];
        var doc = EJSON.clone(oldDoc);
        LocalCollection._applyChanges(doc, fields);
        test.isFalse(at_idx < 0 || at_idx >= results.length);
        test.equal(doc._id, oldDoc._id);
        results[at_idx] = doc;
      },
      movedBefore: function(id, before) {
        var old_idx = find(results, id);
        var new_idx;
        if (before === null)
          new_idx = results.length;
        else
          new_idx = find (results, before);
        if (new_idx > old_idx)
          new_idx--;
        test.isFalse(old_idx < 0 || old_idx >= results.length);
        test.isFalse(new_idx < 0 || new_idx >= results.length);
        results.splice(new_idx, 0, results.splice(old_idx, 1)[0]);
      }
    };

    LocalCollection._diffQueryOrderedChanges(oldResults, newResults, observer);
    test.equal(results, newResults);
  };

  // edge cases and cases run into during debugging
  diffTest(5, [5, 1, 2, 3, 4]);
  diffTest(0, [1, 2, 3, 4]);
  diffTest(4, []);
  diffTest(7, [4, 5, 6, 7, 1, 2, 3]);
  diffTest(7, [5, 6, 7, 1, 2, 3, 4]);
  diffTest(10, [7, 4, 11, 6, 12, 1, 5]);
  diffTest(3, [3, 2, 1]);
  diffTest(10, [2, 7, 4, 6, 11, 3, 8, 9]);
  diffTest(0, []);
  diffTest(1, []);
  diffTest(0, [1]);
  diffTest(1, [1]);
  diffTest(5, [1, 2, 3, 4, 5]);

  // interaction between "changed" and other ops
  diffTest(5, [-5, -1, 2, -3, 4]);
  diffTest(7, [-4, -5, 6, 7, -1, 2, 3]);
  diffTest(7, [5, 6, -7, 1, 2, -3, 4]);
  diffTest(10, [7, -4, 11, 6, 12, -1, 5]);
  diffTest(3, [-3, -2, -1]);
  diffTest(10, [-2, 7, 4, 6, 11, -3, -8, 9]);
});


Tinytest.add("minimongo - saveOriginals", function (test) {
  // set up some data
  var c = new LocalCollection(),
      count;
  c.insert({_id: 'foo', x: 'untouched'});
  c.insert({_id: 'bar', x: 'updateme'});
  c.insert({_id: 'baz', x: 'updateme'});
  c.insert({_id: 'quux', y: 'removeme'});
  c.insert({_id: 'whoa', y: 'removeme'});

  // Save originals and make some changes.
  c.saveOriginals();
  c.insert({_id: "hooray", z: 'insertme'});
  c.remove({y: 'removeme'});
  count = c.update({x: 'updateme'}, {$set: {z: 5}}, {multi: true});
  c.update('bar', {$set: {k: 7}});  // update same doc twice

  // Verify returned count is correct
  test.equal(count, 2);

  // Verify the originals.
  var originals = c.retrieveOriginals();
  var affected = ['bar', 'baz', 'quux', 'whoa', 'hooray'];
  test.equal(originals.size(), _.size(affected));
  _.each(affected, function (id) {
    test.isTrue(originals.has(id));
  });
  test.equal(originals.get('bar'), {_id: 'bar', x: 'updateme'});
  test.equal(originals.get('baz'), {_id: 'baz', x: 'updateme'});
  test.equal(originals.get('quux'), {_id: 'quux', y: 'removeme'});
  test.equal(originals.get('whoa'), {_id: 'whoa', y: 'removeme'});
  test.equal(originals.get('hooray'), undefined);

  // Verify that changes actually occured.
  test.equal(c.find().count(), 4);
  test.equal(c.findOne('foo'), {_id: 'foo', x: 'untouched'});
  test.equal(c.findOne('bar'), {_id: 'bar', x: 'updateme', z: 5, k: 7});
  test.equal(c.findOne('baz'), {_id: 'baz', x: 'updateme', z: 5});
  test.equal(c.findOne('hooray'), {_id: 'hooray', z: 'insertme'});

  // The next call doesn't get the same originals again.
  c.saveOriginals();
  originals = c.retrieveOriginals();
  test.isTrue(originals);
  test.isTrue(originals.empty());

  // Insert and remove a document during the period.
  c.saveOriginals();
  c.insert({_id: 'temp', q: 8});
  c.remove('temp');
  originals = c.retrieveOriginals();
  test.equal(originals.size(), 1);
  test.isTrue(originals.has('temp'));
  test.equal(originals.get('temp'), undefined);
});

Tinytest.add("minimongo - saveOriginals errors", function (test) {
  var c = new LocalCollection();
  // Can't call retrieve before save.
  test.throws(function () { c.retrieveOriginals(); });
  c.saveOriginals();
  // Can't call save twice.
  test.throws(function () { c.saveOriginals(); });
});

Tinytest.add("minimongo - objectid transformation", function (test) {
  var testId = function (item) {
    test.equal(item, LocalCollection._idParse(LocalCollection._idStringify(item)));
  };
  var randomOid = new LocalCollection._ObjectID();
  testId(randomOid);
  testId("FOO");
  testId("ffffffffffff");
  testId("0987654321abcdef09876543");
  testId(new LocalCollection._ObjectID());
  testId("--a string");

  test.equal("ffffffffffff", LocalCollection._idParse(LocalCollection._idStringify("ffffffffffff")));
});


Tinytest.add("minimongo - objectid", function (test) {
  var randomOid = new LocalCollection._ObjectID();
  var anotherRandomOid = new LocalCollection._ObjectID();
  test.notEqual(randomOid, anotherRandomOid);
  test.throws(function() { new LocalCollection._ObjectID("qqqqqqqqqqqqqqqqqqqqqqqq");});
  test.throws(function() { new LocalCollection._ObjectID("ABCDEF"); });
  test.equal(randomOid, new LocalCollection._ObjectID(randomOid.valueOf()));
});

Tinytest.add("minimongo - pause", function (test) {
  var operations = [];
  var cbs = log_callbacks(operations);

  var c = new LocalCollection();
  var h = c.find({}).observe(cbs);

  // remove and add cancel out.
  c.insert({_id: 1, a: 1});
  test.equal(operations.shift(), ['added', {a:1}, 0, null]);

  c.pauseObservers();

  c.remove({_id: 1});
  test.length(operations, 0);
  c.insert({_id: 1, a: 1});
  test.length(operations, 0);

  c.resumeObservers();
  test.length(operations, 0);


  // two modifications become one
  c.pauseObservers();

  c.update({_id: 1}, {a: 2});
  c.update({_id: 1}, {a: 3});

  c.resumeObservers();
  test.equal(operations.shift(), ['changed', {a:3}, 0, {a:1}]);
  test.length(operations, 0);

  // test special case for remove({})
  c.pauseObservers();
  test.equal(c.remove({}), 1);
  test.length(operations, 0);
  c.resumeObservers();
  test.equal(operations.shift(), ['removed', 1, 0, {a:3}]);
  test.length(operations, 0);

  h.stop();
});

Tinytest.add("minimongo - ids matched by selector", function (test) {
  var check = function (selector, ids) {
    var idsFromSelector = LocalCollection._idsMatchedBySelector(selector);
    // XXX normalize order, in a way that also works for ObjectIDs?
    test.equal(idsFromSelector, ids);
  };
  check("foo", ["foo"]);
  check({_id: "foo"}, ["foo"]);
  var oid1 = new LocalCollection._ObjectID();
  check(oid1, [oid1]);
  check({_id: oid1}, [oid1]);
  check({_id: "foo", x: 42}, ["foo"]);
  check({}, null);
  check({_id: {$in: ["foo", oid1]}}, ["foo", oid1]);
  check({_id: {$ne: "foo"}}, null);
  // not actually valid, but works for now...
  check({$and: ["foo"]}, ["foo"]);
  check({$and: [{x: 42}, {_id: oid1}]}, [oid1]);
  check({$and: [{x: 42}, {_id: {$in: [oid1]}}]}, [oid1]);
});

Tinytest.add("minimongo - reactive stop", function (test) {
  var coll = new LocalCollection();
  coll.insert({_id: 'A'});
  coll.insert({_id: 'B'});
  coll.insert({_id: 'C'});

  var addBefore = function (str, newChar, before) {
    var idx = str.indexOf(before);
    if (idx === -1)
      return str + newChar;
    return str.slice(0, idx) + newChar + str.slice(idx);
  };

  var x, y;
  var sortOrder = ReactiveVar(1);

  var c = Tracker.autorun(function () {
    var q = coll.find({}, {sort: {_id: sortOrder.get()}});
    x = "";
    q.observe({ addedAt: function (doc, atIndex, before) {
      x = addBefore(x, doc._id, before);
    }});
    y = "";
    q.observeChanges({ addedBefore: function (id, fields, before) {
      y = addBefore(y, id, before);
    }});
  });

  test.equal(x, "ABC");
  test.equal(y, "ABC");

  sortOrder.set(-1);
  test.equal(x, "ABC");
  test.equal(y, "ABC");
  Tracker.flush();
  test.equal(x, "CBA");
  test.equal(y, "CBA");

  coll.insert({_id: 'D'});
  coll.insert({_id: 'E'});
  test.equal(x, "EDCBA");
  test.equal(y, "EDCBA");

  c.stop();
  // stopping kills the observes immediately
  coll.insert({_id: 'F'});
  test.equal(x, "EDCBA");
  test.equal(y, "EDCBA");
});

Tinytest.add("minimongo - immediate invalidate", function (test) {
  var coll = new LocalCollection();
  coll.insert({_id: 'A'});

  // This has two separate findOnes.  findOne() uses skip/limit, which means
  // that its response to an update() call involves a recompute. We used to have
  // a bug where we would first calculate all the calls that need to be
  // recomputed, then recompute them one by one, without checking to see if the
  // callbacks from recomputing one query stopped the second query, which
  // crashed.
  var c = Tracker.autorun(function () {
    coll.findOne('A');
    coll.findOne('A');
  });

  coll.update('A', {$set: {x: 42}});

  c.stop();
});


Tinytest.add("minimongo - count on cursor with limit", function(test){
  var coll = new LocalCollection(), count;

  coll.insert({_id: 'A'});
  coll.insert({_id: 'B'});
  coll.insert({_id: 'C'});
  coll.insert({_id: 'D'});

  var c = Tracker.autorun(function (c) {
    var cursor = coll.find({_id: {$exists: true}}, {sort: {_id: 1}, limit: 3});
    count = cursor.count();
  });

  test.equal(count, 3);

  coll.remove('A'); // still 3 in the collection
  Tracker.flush();
  test.equal(count, 3);

  coll.remove('B'); // expect count now 2
  Tracker.flush();
  test.equal(count, 2);


  coll.insert({_id: 'A'}); // now 3 again
  Tracker.flush();
  test.equal(count, 3);

  coll.insert({_id: 'B'}); // now 4 entries, but count should be 3 still
  Tracker.flush();
  test.equal(count, 3);

  c.stop();
});

Tinytest.add("minimongo - reactive count with cached cursor", function (test) {
  var coll = new LocalCollection;
  var cursor = coll.find({});
  var firstAutorunCount, secondAutorunCount;
  Tracker.autorun(function(){
    firstAutorunCount = cursor.count();
  });
  Tracker.autorun(function(){
    secondAutorunCount = coll.find({}).count();
  });
  test.equal(firstAutorunCount, 0);
  test.equal(secondAutorunCount, 0);
  coll.insert({i: 1});
  coll.insert({i: 2});
  coll.insert({i: 3});
  Tracker.flush();
  test.equal(firstAutorunCount, 3);
  test.equal(secondAutorunCount, 3);
});

Tinytest.add("minimongo - $near operator tests", function (test) {
  var coll = new LocalCollection();
  coll.insert({ rest: { loc: [2, 3] } });
  coll.insert({ rest: { loc: [-3, 3] } });
  coll.insert({ rest: { loc: [5, 5] } });

  test.equal(coll.find({ 'rest.loc': { $near: [0, 0], $maxDistance: 30 } }).count(), 3);
  test.equal(coll.find({ 'rest.loc': { $near: [0, 0], $maxDistance: 4 } }).count(), 1);
  var points = coll.find({ 'rest.loc': { $near: [0, 0], $maxDistance: 6 } }).fetch();
  _.each(points, function (point, i, points) {
    test.isTrue(!i || distance([0, 0], point.rest.loc) >= distance([0, 0], points[i - 1].rest.loc));
  });

  function distance(a, b) {
    var x = a[0] - b[0];
    var y = a[1] - b[1];
    return Math.sqrt(x * x + y * y);
  }

  // GeoJSON tests
  coll = new LocalCollection();
  var data = [{ "category" : "BURGLARY", "descript" : "BURGLARY OF STORE, FORCIBLE ENTRY", "address" : "100 Block of 10TH ST", "location" : { "type" : "Point", "coordinates" : [  -122.415449723856,  37.7749518087273 ] } },
    { "category" : "WEAPON LAWS", "descript" : "POSS OF PROHIBITED WEAPON", "address" : "900 Block of MINNA ST", "location" : { "type" : "Point", "coordinates" : [  -122.415386041221,  37.7747879744156 ] } },
    { "category" : "LARCENY/THEFT", "descript" : "GRAND THEFT OF PROPERTY", "address" : "900 Block of MINNA ST", "location" : { "type" : "Point", "coordinates" : [  -122.41538270191,  37.774683628213 ] } },
    { "category" : "LARCENY/THEFT", "descript" : "PETTY THEFT FROM LOCKED AUTO", "address" : "900 Block of MINNA ST", "location" : { "type" : "Point", "coordinates" : [  -122.415396041221,  37.7747879744156 ] } },
    { "category" : "OTHER OFFENSES", "descript" : "POSSESSION OF BURGLARY TOOLS", "address" : "900 Block of MINNA ST", "location" : { "type" : "Point", "coordinates" : [  -122.415386041221,  37.7747879734156 ] } }
  ];

  _.each(data, function (x, i) { coll.insert(_.extend(x, { x: i })); });

  var close15 = coll.find({ location: { $near: {
    $geometry: { type: "Point",
                 coordinates: [-122.4154282, 37.7746115] },
    $maxDistance: 15 } } }).fetch();
  test.length(close15, 1);
  test.equal(close15[0].descript, "GRAND THEFT OF PROPERTY");

  var close20 = coll.find({ location: { $near: {
    $geometry: { type: "Point",
                 coordinates: [-122.4154282, 37.7746115] },
    $maxDistance: 20 } } }).fetch();
  test.length(close20, 4);
  test.equal(close20[0].descript, "GRAND THEFT OF PROPERTY");
  test.equal(close20[1].descript, "PETTY THEFT FROM LOCKED AUTO");
  test.equal(close20[2].descript, "POSSESSION OF BURGLARY TOOLS");
  test.equal(close20[3].descript, "POSS OF PROHIBITED WEAPON");

  // Any combinations of $near with $or/$and/$nor/$not should throw an error
  test.throws(function () {
    coll.find({ location: {
      $not: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [-122.4154282, 37.7746115]
          }, $maxDistance: 20 } } } });
  });
  test.throws(function () {
    coll.find({
      $and: [ { location: { $near: { $geometry: { type: "Point", coordinates: [-122.4154282, 37.7746115] }, $maxDistance: 20 }}},
              { x: 0 }]
    });
  });
  test.throws(function () {
    coll.find({
      $or: [ { location: { $near: { $geometry: { type: "Point", coordinates: [-122.4154282, 37.7746115] }, $maxDistance: 20 }}},
             { x: 0 }]
    });
  });
  test.throws(function () {
    coll.find({
      $nor: [ { location: { $near: { $geometry: { type: "Point", coordinates: [-122.4154282, 37.7746115] }, $maxDistance: 1 }}},
              { x: 0 }]
    });
  });
  test.throws(function () {
    coll.find({
      $and: [{
        $and: [{
          location: {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [-122.4154282, 37.7746115]
              },
              $maxDistance: 1
            }
          }
        }]
      }]
    });
  });

  // array tests
  coll = new LocalCollection();
  coll.insert({
    _id: "x",
    k: 9,
    a: [
      {b: [
        [100, 100],
        [1,  1]]},
      {b: [150,  150]}]});
  coll.insert({
    _id: "y",
    k: 9,
    a: {b: [5, 5]}});
  var testNear = function (near, md, expected) {
    test.equal(
      _.pluck(
        coll.find({'a.b': {$near: near, $maxDistance: md}}).fetch(), '_id'),
      expected);
  };
  testNear([149, 149], 4, ['x']);
  testNear([149, 149], 1000, ['x', 'y']);
  // It's important that we figure out that 'x' is closer than 'y' to [2,2] even
  // though the first within-1000 point in 'x' (ie, [100,100]) is farther than
  // 'y'.
  testNear([2, 2], 1000, ['x', 'y']);

  // Ensure that distance is used as a tie-breaker for sort.
  test.equal(
    _.pluck(coll.find({'a.b': {$near: [1, 1]}}, {sort: {k: 1}}).fetch(), '_id'),
    ['x', 'y']);
  test.equal(
    _.pluck(coll.find({'a.b': {$near: [5, 5]}}, {sort: {k: 1}}).fetch(), '_id'),
    ['y', 'x']);

  var operations = [];
  var cbs = log_callbacks(operations);
  var handle = coll.find({'a.b': {$near: [7,7]}}).observe(cbs);

  test.length(operations, 2);
  test.equal(operations.shift(), ['added', {k:9, a:{b:[5,5]}}, 0, null]);
  test.equal(operations.shift(),
             ['added', {k: 9, a:[{b:[[100,100],[1,1]]},{b:[150,150]}]},
              1, null]);
  // This needs to be inserted in the MIDDLE of the two existing ones.
  coll.insert({a: {b: [3,3]}});
  test.length(operations, 1);
  test.equal(operations.shift(), ['added', {a: {b: [3, 3]}}, 1, 'x']);

  handle.stop();
});

// See #2275.
Tinytest.add("minimongo - fetch in observe", function (test) {
  var coll = new LocalCollection;
  var callbackInvoked = false;
  var observe = coll.find().observeChanges({
    added: function (id, fields) {
      callbackInvoked = true;
      test.equal(fields, {foo: 1});
      var doc = coll.findOne({foo: 1});
      test.isTrue(doc);
      test.equal(doc.foo, 1);
    }
  });
  test.isFalse(callbackInvoked);
  var computation = Tracker.autorun(function (computation) {
    if (computation.firstRun) {
      coll.insert({foo: 1});
    }
  });
  test.isTrue(callbackInvoked);
  observe.stop();
  computation.stop();
});

// See #2254
Tinytest.add("minimongo - fine-grained reactivity of observe with fields projection", function (test) {
  var X = new LocalCollection;
  var id = "asdf";
  X.insert({_id: id, foo: {bar: 123}});

  var callbackInvoked = false;
  var obs = X.find(id, {fields: {'foo.bar': 1}}).observeChanges({
    changed: function (id, fields) {
      callbackInvoked = true;
    }
  });

  test.isFalse(callbackInvoked);
  X.update(id, {$set: {'foo.baz': 456}});
  test.isFalse(callbackInvoked);

  obs.stop();
});
Tinytest.add("minimongo - fine-grained reactivity of query with fields projection", function (test) {
  var X = new LocalCollection;
  var id = "asdf";
  X.insert({_id: id, foo: {bar: 123}});

  var callbackInvoked = false;
  var computation = Tracker.autorun(function () {
    callbackInvoked = true;
    return X.findOne(id, { fields: { 'foo.bar': 1 } });
  });
  test.isTrue(callbackInvoked);
  callbackInvoked = false;
  X.update(id, {$set: {'foo.baz': 456}});
  test.isFalse(callbackInvoked);
  X.update(id, {$set: {'foo.bar': 124}});
  Tracker.flush();
  test.isTrue(callbackInvoked);

  computation.stop();
});

},{}],7:[function(require,module,exports){
// XXX need a strategy for passing the binding of $ into this
// function, from the compiled selector
//
// maybe just {key.up.to.just.before.dollarsign: array_index}
//
// XXX atomicity: if one modification fails, do we roll back the whole
// change?
//
// options:
//   - isInsert is set when _modify is being called to compute the document to
//     insert as part of an upsert operation. We use this primarily to figure
//     out when to set the fields in $setOnInsert, if present.
LocalCollection._modify = function (doc, mod, options) {
  options = options || {};
  if (!isPlainObject(mod))
    throw MinimongoError("Modifier must be an object");
  var isModifier = isOperatorObject(mod);

  var newDoc;

  if (!isModifier) {
    if (mod._id && !EJSON.equals(doc._id, mod._id))
      throw MinimongoError("Cannot change the _id of a document");

    // replace the whole document
    for (var k in mod) {
      if (/\./.test(k))
        throw MinimongoError(
          "When replacing document, field name may not contain '.'");
    }
    newDoc = mod;
  } else {
    // apply modifiers to the doc.
    newDoc = EJSON.clone(doc);

    _.each(mod, function (operand, op) {
      var modFunc = MODIFIERS[op];
      // Treat $setOnInsert as $set if this is an insert.
      if (options.isInsert && op === '$setOnInsert')
        modFunc = MODIFIERS['$set'];
      if (!modFunc)
        throw MinimongoError("Invalid modifier specified " + op);
      _.each(operand, function (arg, keypath) {
        if (keypath === '') {
          throw MinimongoError("An empty update path is not valid.");
        }

        if (keypath === '_id') {
          throw MinimongoError("Mod on _id not allowed");
        }

        var keyparts = keypath.split('.');

        if (! _.all(keyparts, _.identity)) {
          throw MinimongoError(
            "The update path '" + keypath +
              "' contains an empty field name, which is not allowed.");
        }

        var noCreate = _.has(NO_CREATE_MODIFIERS, op);
        var forbidArray = (op === "$rename");
        var target = findModTarget(newDoc, keyparts, {
          noCreate: NO_CREATE_MODIFIERS[op],
          forbidArray: (op === "$rename"),
          arrayIndices: options.arrayIndices
        });
        var field = keyparts.pop();
        modFunc(target, field, arg, keypath, newDoc);
      });
    });
  }

  // move new document into place.
  _.each(_.keys(doc), function (k) {
    // Note: this used to be for (var k in doc) however, this does not
    // work right in Opera. Deleting from a doc while iterating over it
    // would sometimes cause opera to skip some keys.
    if (k !== '_id')
      delete doc[k];
  });
  _.each(newDoc, function (v, k) {
    doc[k] = v;
  });
};

// for a.b.c.2.d.e, keyparts should be ['a', 'b', 'c', '2', 'd', 'e'],
// and then you would operate on the 'e' property of the returned
// object.
//
// if options.noCreate is falsey, creates intermediate levels of
// structure as necessary, like mkdir -p (and raises an exception if
// that would mean giving a non-numeric property to an array.) if
// options.noCreate is true, return undefined instead.
//
// may modify the last element of keyparts to signal to the caller that it needs
// to use a different value to index into the returned object (for example,
// ['a', '01'] -> ['a', 1]).
//
// if forbidArray is true, return null if the keypath goes through an array.
//
// if options.arrayIndices is set, use its first element for the (first) '$' in
// the path.
var findModTarget = function (doc, keyparts, options) {
  options = options || {};
  var usedArrayIndex = false;
  for (var i = 0; i < keyparts.length; i++) {
    var last = (i === keyparts.length - 1);
    var keypart = keyparts[i];
    var indexable = isIndexable(doc);
    if (!indexable) {
      if (options.noCreate)
        return undefined;
      var e = MinimongoError(
        "cannot use the part '" + keypart + "' to traverse " + doc);
      e.setPropertyError = true;
      throw e;
    }
    if (doc instanceof Array) {
      if (options.forbidArray)
        return null;
      if (keypart === '$') {
        if (usedArrayIndex)
          throw MinimongoError("Too many positional (i.e. '$') elements");
        if (!options.arrayIndices || !options.arrayIndices.length) {
          throw MinimongoError("The positional operator did not find the " +
                               "match needed from the query");
        }
        keypart = options.arrayIndices[0];
        usedArrayIndex = true;
      } else if (isNumericKey(keypart)) {
        keypart = parseInt(keypart);
      } else {
        if (options.noCreate)
          return undefined;
        throw MinimongoError(
          "can't append to array using string field name ["
                    + keypart + "]");
      }
      if (last)
        // handle 'a.01'
        keyparts[i] = keypart;
      if (options.noCreate && keypart >= doc.length)
        return undefined;
      while (doc.length < keypart)
        doc.push(null);
      if (!last) {
        if (doc.length === keypart)
          doc.push({});
        else if (typeof doc[keypart] !== "object")
          throw MinimongoError("can't modify field '" + keyparts[i + 1] +
                      "' of list value " + JSON.stringify(doc[keypart]));
      }
    } else {
      if (keypart.length && keypart.substr(0, 1) === '$')
        throw MinimongoError("can't set field named " + keypart);
      if (!(keypart in doc)) {
        if (options.noCreate)
          return undefined;
        if (!last)
          doc[keypart] = {};
      }
    }

    if (last)
      return doc;
    doc = doc[keypart];
  }

  // notreached
};

var NO_CREATE_MODIFIERS = {
  $unset: true,
  $pop: true,
  $rename: true,
  $pull: true,
  $pullAll: true
};

var MODIFIERS = {
  $inc: function (target, field, arg) {
    if (typeof arg !== "number")
      throw MinimongoError("Modifier $inc allowed for numbers only");
    if (field in target) {
      if (typeof target[field] !== "number")
        throw MinimongoError("Cannot apply $inc modifier to non-number");
      target[field] += arg;
    } else {
      target[field] = arg;
    }
  },
  $set: function (target, field, arg) {
    if (!_.isObject(target)) { // not an array or an object
      var e = MinimongoError("Cannot set property on non-object field");
      e.setPropertyError = true;
      throw e;
    }
    if (target === null) {
      var e = MinimongoError("Cannot set property on null");
      e.setPropertyError = true;
      throw e;
    }
    target[field] = EJSON.clone(arg);
  },
  $setOnInsert: function (target, field, arg) {
    // converted to `$set` in `_modify`
  },
  $unset: function (target, field, arg) {
    if (target !== undefined) {
      if (target instanceof Array) {
        if (field in target)
          target[field] = null;
      } else
        delete target[field];
    }
  },
  $push: function (target, field, arg) {
    if (target[field] === undefined)
      target[field] = [];
    if (!(target[field] instanceof Array))
      throw MinimongoError("Cannot apply $push modifier to non-array");

    if (!(arg && arg.$each)) {
      // Simple mode: not $each
      target[field].push(EJSON.clone(arg));
      return;
    }

    // Fancy mode: $each (and maybe $slice and $sort)
    var toPush = arg.$each;
    if (!(toPush instanceof Array))
      throw MinimongoError("$each must be an array");

    // Parse $slice.
    var slice = undefined;
    if ('$slice' in arg) {
      if (typeof arg.$slice !== "number")
        throw MinimongoError("$slice must be a numeric value");
      // XXX should check to make sure integer
      if (arg.$slice > 0)
        throw MinimongoError("$slice in $push must be zero or negative");
      slice = arg.$slice;
    }

    // Parse $sort.
    var sortFunction = undefined;
    if (arg.$sort) {
      if (slice === undefined)
        throw MinimongoError("$sort requires $slice to be present");
      // XXX this allows us to use a $sort whose value is an array, but that's
      // actually an extension of the Node driver, so it won't work
      // server-side. Could be confusing!
      // XXX is it correct that we don't do geo-stuff here?
      sortFunction = new Minimongo.Sorter(arg.$sort).getComparator();
      for (var i = 0; i < toPush.length; i++) {
        if (LocalCollection._f._type(toPush[i]) !== 3) {
          throw MinimongoError("$push like modifiers using $sort " +
                      "require all elements to be objects");
        }
      }
    }

    // Actually push.
    for (var j = 0; j < toPush.length; j++)
      target[field].push(EJSON.clone(toPush[j]));

    // Actually sort.
    if (sortFunction)
      target[field].sort(sortFunction);

    // Actually slice.
    if (slice !== undefined) {
      if (slice === 0)
        target[field] = [];  // differs from Array.slice!
      else
        target[field] = target[field].slice(slice);
    }
  },
  $pushAll: function (target, field, arg) {
    if (!(typeof arg === "object" && arg instanceof Array))
      throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");
    var x = target[field];
    if (x === undefined)
      target[field] = arg;
    else if (!(x instanceof Array))
      throw MinimongoError("Cannot apply $pushAll modifier to non-array");
    else {
      for (var i = 0; i < arg.length; i++)
        x.push(arg[i]);
    }
  },
  $addToSet: function (target, field, arg) {
    var isEach = false;
    if (typeof arg === "object") {
      //check if first key is '$each'
      for (var k in arg) {
        if (k === "$each")
          isEach = true;
        break;
      }
    }
    var values = isEach ? arg["$each"] : [arg];
    var x = target[field];
    if (x === undefined)
      target[field] = values;
    else if (!(x instanceof Array))
      throw MinimongoError("Cannot apply $addToSet modifier to non-array");
    else {
      _.each(values, function (value) {
        for (var i = 0; i < x.length; i++)
          if (LocalCollection._f._equal(value, x[i]))
            return;
        x.push(EJSON.clone(value));
      });
    }
  },
  $pop: function (target, field, arg) {
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw MinimongoError("Cannot apply $pop modifier to non-array");
    else {
      if (typeof arg === 'number' && arg < 0)
        x.splice(0, 1);
      else
        x.pop();
    }
  },
  $pull: function (target, field, arg) {
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw MinimongoError("Cannot apply $pull/pullAll modifier to non-array");
    else {
      var out = [];
      if (typeof arg === "object" && !(arg instanceof Array)) {
        // XXX would be much nicer to compile this once, rather than
        // for each document we modify.. but usually we're not
        // modifying that many documents, so we'll let it slide for
        // now

        // XXX Minimongo.Matcher isn't up for the job, because we need
        // to permit stuff like {$pull: {a: {$gt: 4}}}.. something
        // like {$gt: 4} is not normally a complete selector.
        // same issue as $elemMatch possibly?
        var matcher = new Minimongo.Matcher(arg);
        for (var i = 0; i < x.length; i++)
          if (!matcher.documentMatches(x[i]).result)
            out.push(x[i]);
      } else {
        for (var i = 0; i < x.length; i++)
          if (!LocalCollection._f._equal(x[i], arg))
            out.push(x[i]);
      }
      target[field] = out;
    }
  },
  $pullAll: function (target, field, arg) {
    if (!(typeof arg === "object" && arg instanceof Array))
      throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");
    if (target === undefined)
      return;
    var x = target[field];
    if (x === undefined)
      return;
    else if (!(x instanceof Array))
      throw MinimongoError("Cannot apply $pull/pullAll modifier to non-array");
    else {
      var out = [];
      for (var i = 0; i < x.length; i++) {
        var exclude = false;
        for (var j = 0; j < arg.length; j++) {
          if (LocalCollection._f._equal(x[i], arg[j])) {
            exclude = true;
            break;
          }
        }
        if (!exclude)
          out.push(x[i]);
      }
      target[field] = out;
    }
  },
  $rename: function (target, field, arg, keypath, doc) {
    if (keypath === arg)
      // no idea why mongo has this restriction..
      throw MinimongoError("$rename source must differ from target");
    if (target === null)
      throw MinimongoError("$rename source field invalid");
    if (typeof arg !== "string")
      throw MinimongoError("$rename target must be a string");
    if (target === undefined)
      return;
    var v = target[field];
    delete target[field];

    var keyparts = arg.split('.');
    var target2 = findModTarget(doc, keyparts, {forbidArray: true});
    if (target2 === null)
      throw MinimongoError("$rename target field invalid");
    var field2 = keyparts.pop();
    target2[field2] = v;
  },
  $bit: function (target, field, arg) {
    // XXX mongo only supports $bit on integers, and we only support
    // native javascript numbers (doubles) so far, so we can't support $bit
    throw MinimongoError("$bit is not supported");
  }
};

},{}],8:[function(require,module,exports){
LocalCollection._looksLikeObjectID = function (str) {
  return str.length === 24 && str.match(/^[0-9a-f]*$/);
};

LocalCollection._ObjectID = function (hexString) {
  //random-based impl of Mongo ObjectID
  var self = this;
  if (hexString) {
    hexString = hexString.toLowerCase();
    if (!LocalCollection._looksLikeObjectID(hexString)) {
      throw new Error("Invalid hexadecimal string for creating an ObjectID");
    }
    // meant to work with _.isEqual(), which relies on structural equality
    self._str = hexString;
  } else {
    self._str = Random.hexString(24);
  }
};

LocalCollection._ObjectID.prototype.toString = function () {
  var self = this;
  return "ObjectID(\"" + self._str + "\")";
};

LocalCollection._ObjectID.prototype.equals = function (other) {
  var self = this;
  return other instanceof LocalCollection._ObjectID &&
    self.valueOf() === other.valueOf();
};

LocalCollection._ObjectID.prototype.clone = function () {
  var self = this;
  return new LocalCollection._ObjectID(self._str);
};

LocalCollection._ObjectID.prototype.typeName = function() {
  return "oid";
};

LocalCollection._ObjectID.prototype.getTimestamp = function() {
  var self = this;
  return parseInt(self._str.substr(0, 8), 16);
};

LocalCollection._ObjectID.prototype.valueOf =
    LocalCollection._ObjectID.prototype.toJSONValue =
    LocalCollection._ObjectID.prototype.toHexString =
    function () { return this._str; };

// Is this selector just shorthand for lookup by _id?
LocalCollection._selectorIsId = function (selector) {
  return (typeof selector === "string") ||
    (typeof selector === "number") ||
    selector instanceof LocalCollection._ObjectID;
};

// Is the selector just lookup by _id (shorthand or not)?
LocalCollection._selectorIsIdPerhapsAsObject = function (selector) {
  return LocalCollection._selectorIsId(selector) ||
    (selector && typeof selector === "object" &&
     selector._id && LocalCollection._selectorIsId(selector._id) &&
     _.size(selector) === 1);
};

// If this is a selector which explicitly constrains the match by ID to a finite
// number of documents, returns a list of their IDs.  Otherwise returns
// null. Note that the selector may have other restrictions so it may not even
// match those document!  We care about $in and $and since those are generated
// access-controlled update and remove.
LocalCollection._idsMatchedBySelector = function (selector) {
  // Is the selector just an ID?
  if (LocalCollection._selectorIsId(selector))
    return [selector];
  if (!selector)
    return null;

  // Do we have an _id clause?
  if (_.has(selector, '_id')) {
    // Is the _id clause just an ID?
    if (LocalCollection._selectorIsId(selector._id))
      return [selector._id];
    // Is the _id clause {_id: {$in: ["x", "y", "z"]}}?
    if (selector._id && selector._id.$in
        && _.isArray(selector._id.$in)
        && !_.isEmpty(selector._id.$in)
        && _.all(selector._id.$in, LocalCollection._selectorIsId)) {
      return selector._id.$in;
    }
    return null;
  }

  // If this is a top-level $and, and any of the clauses constrain their
  // documents, then the whole selector is constrained by any one clause's
  // constraint. (Well, by their intersection, but that seems unlikely.)
  if (selector.$and && _.isArray(selector.$and)) {
    for (var i = 0; i < selector.$and.length; ++i) {
      var subIds = LocalCollection._idsMatchedBySelector(selector.$and[i]);
      if (subIds)
        return subIds;
    }
  }

  return null;
};

EJSON.addType("oid",  function (str) {
  return new LocalCollection._ObjectID(str);
});

},{}],9:[function(require,module,exports){
// XXX maybe move these into another ObserveHelpers package or something

// _CachingChangeObserver is an object which receives observeChanges callbacks
// and keeps a cache of the current cursor state up to date in self.docs. Users
// of this class should read the docs field but not modify it. You should pass
// the "applyChange" field as the callbacks to the underlying observeChanges
// call. Optionally, you can specify your own observeChanges callbacks which are
// invoked immediately before the docs field is updated; this object is made
// available as `this` to those callbacks.
LocalCollection._CachingChangeObserver = function (options) {
  var self = this;
  options = options || {};

  var orderedFromCallbacks = options.callbacks &&
        LocalCollection._observeChangesCallbacksAreOrdered(options.callbacks);
  if (_.has(options, 'ordered')) {
    self.ordered = options.ordered;
    if (options.callbacks && options.ordered !== orderedFromCallbacks)
      throw Error("ordered option doesn't match callbacks");
  } else if (options.callbacks) {
    self.ordered = orderedFromCallbacks;
  } else {
    throw Error("must provide ordered or callbacks");
  }
  var callbacks = options.callbacks || {};

  if (self.ordered) {
    self.docs = new OrderedDict(LocalCollection._idStringify);
    self.applyChange = {
      addedBefore: function (id, fields, before) {
        var doc = EJSON.clone(fields);
        doc._id = id;
        callbacks.addedBefore && callbacks.addedBefore.call(
          self, id, fields, before);
        // This line triggers if we provide added with movedBefore.
        callbacks.added && callbacks.added.call(self, id, fields);
        // XXX could `before` be a falsy ID?  Technically
        // idStringify seems to allow for them -- though
        // OrderedDict won't call stringify on a falsy arg.
        self.docs.putBefore(id, doc, before || null);
      },
      movedBefore: function (id, before) {
        var doc = self.docs.get(id);
        callbacks.movedBefore && callbacks.movedBefore.call(self, id, before);
        self.docs.moveBefore(id, before || null);
      }
    };
  } else {
    self.docs = new LocalCollection._IdMap;
    self.applyChange = {
      added: function (id, fields) {
        var doc = EJSON.clone(fields);
        callbacks.added && callbacks.added.call(self, id, fields);
        doc._id = id;
        self.docs.set(id,  doc);
      }
    };
  }

  // The methods in _IdMap and OrderedDict used by these callbacks are
  // identical.
  self.applyChange.changed = function (id, fields) {
    var doc = self.docs.get(id);
    if (!doc)
      throw new Error("Unknown id for changed: " + id);
    callbacks.changed && callbacks.changed.call(
      self, id, EJSON.clone(fields));
    LocalCollection._applyChanges(doc, fields);
  };
  self.applyChange.removed = function (id) {
    callbacks.removed && callbacks.removed.call(self, id);
    self.docs.remove(id);
  };
};

LocalCollection._observeFromObserveChanges = function (cursor, observeCallbacks) {
  var transform = cursor.getTransform() || function (doc) {return doc;};
  var suppressed = !!observeCallbacks._suppress_initial;

  var observeChangesCallbacks;
  if (LocalCollection._observeCallbacksAreOrdered(observeCallbacks)) {
    // The "_no_indices" option sets all index arguments to -1 and skips the
    // linear scans required to generate them.  This lets observers that don't
    // need absolute indices benefit from the other features of this API --
    // relative order, transforms, and applyChanges -- without the speed hit.
    var indices = !observeCallbacks._no_indices;
    observeChangesCallbacks = {
      addedBefore: function (id, fields, before) {
        var self = this;
        if (suppressed || !(observeCallbacks.addedAt || observeCallbacks.added))
          return;
        var doc = transform(_.extend(fields, {_id: id}));
        if (observeCallbacks.addedAt) {
          var index = indices
                ? (before ? self.docs.indexOf(before) : self.docs.size()) : -1;
          observeCallbacks.addedAt(doc, index, before);
        } else {
          observeCallbacks.added(doc);
        }
      },
      changed: function (id, fields) {
        var self = this;
        if (!(observeCallbacks.changedAt || observeCallbacks.changed))
          return;
        var doc = EJSON.clone(self.docs.get(id));
        if (!doc)
          throw new Error("Unknown id for changed: " + id);
        var oldDoc = transform(EJSON.clone(doc));
        LocalCollection._applyChanges(doc, fields);
        doc = transform(doc);
        if (observeCallbacks.changedAt) {
          var index = indices ? self.docs.indexOf(id) : -1;
          observeCallbacks.changedAt(doc, oldDoc, index);
        } else {
          observeCallbacks.changed(doc, oldDoc);
        }
      },
      movedBefore: function (id, before) {
        var self = this;
        if (!observeCallbacks.movedTo)
          return;
        var from = indices ? self.docs.indexOf(id) : -1;

        var to = indices
              ? (before ? self.docs.indexOf(before) : self.docs.size()) : -1;
        // When not moving backwards, adjust for the fact that removing the
        // document slides everything back one slot.
        if (to > from)
          --to;
        observeCallbacks.movedTo(transform(EJSON.clone(self.docs.get(id))),
                                 from, to, before || null);
      },
      removed: function (id) {
        var self = this;
        if (!(observeCallbacks.removedAt || observeCallbacks.removed))
          return;
        // technically maybe there should be an EJSON.clone here, but it's about
        // to be removed from self.docs!
        var doc = transform(self.docs.get(id));
        if (observeCallbacks.removedAt) {
          var index = indices ? self.docs.indexOf(id) : -1;
          observeCallbacks.removedAt(doc, index);
        } else {
          observeCallbacks.removed(doc);
        }
      }
    };
  } else {
    observeChangesCallbacks = {
      added: function (id, fields) {
        if (!suppressed && observeCallbacks.added) {
          var doc = _.extend(fields, {_id:  id});
          observeCallbacks.added(transform(doc));
        }
      },
      changed: function (id, fields) {
        var self = this;
        if (observeCallbacks.changed) {
          var oldDoc = self.docs.get(id);
          var doc = EJSON.clone(oldDoc);
          LocalCollection._applyChanges(doc, fields);
          observeCallbacks.changed(transform(doc),
                                   transform(EJSON.clone(oldDoc)));
        }
      },
      removed: function (id) {
        var self = this;
        if (observeCallbacks.removed) {
          observeCallbacks.removed(transform(self.docs.get(id)));
        }
      }
    };
  }

  var changeObserver = new LocalCollection._CachingChangeObserver(
    {callbacks: observeChangesCallbacks});
  var handle = cursor.observeChanges(changeObserver.applyChange);
  suppressed = false;

  return handle;
};

},{}],10:[function(require,module,exports){
Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  version: '1.0.8'
});

Package.onUse(function (api) {
  api.export('LocalCollection');
  api.export('Minimongo');
  api.export('MinimongoTest', { testOnly: true });
  api.use(['underscore', 'json', 'ejson', 'id-map', 'ordered-dict', 'tracker',
           'random', 'ordered-dict']);
  // This package is used for geo-location queries such as $near
  api.use('geojson-utils');
  api.addFiles([
    'minimongo.js',
    'wrap_transform.js',
    'helpers.js',
    'selector.js',
    'sort.js',
    'projection.js',
    'modify.js',
    'diff.js',
    'id_map.js',
    'observe.js',
    'objectid.js'
  ]);

  // Functionality used only by oplog tailing on the server side
  api.addFiles([
    'selector_projection.js',
    'selector_modifier.js',
    'sorter_projection.js'
  ], 'server');
});

Package.onTest(function (api) {
  api.use('minimongo', ['client', 'server']);
  api.use('test-helpers', 'client');
  api.use(['tinytest', 'underscore', 'ejson', 'ordered-dict',
           'random', 'tracker', 'reactive-var']);
  api.addFiles('minimongo_tests.js', 'client');
  api.addFiles('wrap_transform_tests.js');
  api.addFiles('minimongo_server_tests.js', 'server');
});

},{}],11:[function(require,module,exports){
// Knows how to compile a fields projection to a predicate function.
// @returns - Function: a closure that filters out an object according to the
//            fields projection rules:
//            @param obj - Object: MongoDB-styled document
//            @returns - Object: a document with the fields filtered out
//                       according to projection rules. Doesn't retain subfields
//                       of passed argument.
LocalCollection._compileProjection = function (fields) {
  LocalCollection._checkSupportedProjection(fields);

  var _idProjection = _.isUndefined(fields._id) ? true : fields._id;
  var details = projectionDetails(fields);

  // returns transformed doc according to ruleTree
  var transform = function (doc, ruleTree) {
    // Special case for "sets"
    if (_.isArray(doc))
      return _.map(doc, function (subdoc) { return transform(subdoc, ruleTree); });

    var res = details.including ? {} : EJSON.clone(doc);
    _.each(ruleTree, function (rule, key) {
      if (!_.has(doc, key))
        return;
      if (_.isObject(rule)) {
        // For sub-objects/subsets we branch
        if (_.isObject(doc[key]))
          res[key] = transform(doc[key], rule);
        // Otherwise we don't even touch this subfield
      } else if (details.including)
        res[key] = EJSON.clone(doc[key]);
      else
        delete res[key];
    });

    return res;
  };

  return function (obj) {
    var res = transform(obj, details.tree);

    if (_idProjection && _.has(obj, '_id'))
      res._id = obj._id;
    if (!_idProjection && _.has(res, '_id'))
      delete res._id;
    return res;
  };
};

// Traverses the keys of passed projection and constructs a tree where all
// leaves are either all True or all False
// @returns Object:
//  - tree - Object - tree representation of keys involved in projection
//  (exception for '_id' as it is a special case handled separately)
//  - including - Boolean - "take only certain fields" type of projection
projectionDetails = function (fields) {
  // Find the non-_id keys (_id is handled specially because it is included unless
  // explicitly excluded). Sort the keys, so that our code to detect overlaps
  // like 'foo' and 'foo.bar' can assume that 'foo' comes first.
  var fieldsKeys = _.keys(fields).sort();

  // If there are other rules other than '_id', treat '_id' differently in a
  // separate case. If '_id' is the only rule, use it to understand if it is
  // including/excluding projection.
  if (fieldsKeys.length > 0 && !(fieldsKeys.length === 1 && fieldsKeys[0] === '_id'))
    fieldsKeys = _.reject(fieldsKeys, function (key) { return key === '_id'; });

  var including = null; // Unknown

  _.each(fieldsKeys, function (keyPath) {
    var rule = !!fields[keyPath];
    if (including === null)
      including = rule;
    if (including !== rule)
      // This error message is copies from MongoDB shell
      throw MinimongoError("You cannot currently mix including and excluding fields.");
  });


  var projectionRulesTree = pathsToTree(
    fieldsKeys,
    function (path) { return including; },
    function (node, path, fullPath) {
      // Check passed projection fields' keys: If you have two rules such as
      // 'foo.bar' and 'foo.bar.baz', then the result becomes ambiguous. If
      // that happens, there is a probability you are doing something wrong,
      // framework should notify you about such mistake earlier on cursor
      // compilation step than later during runtime.  Note, that real mongo
      // doesn't do anything about it and the later rule appears in projection
      // project, more priority it takes.
      //
      // Example, assume following in mongo shell:
      // > db.coll.insert({ a: { b: 23, c: 44 } })
      // > db.coll.find({}, { 'a': 1, 'a.b': 1 })
      // { "_id" : ObjectId("520bfe456024608e8ef24af3"), "a" : { "b" : 23 } }
      // > db.coll.find({}, { 'a.b': 1, 'a': 1 })
      // { "_id" : ObjectId("520bfe456024608e8ef24af3"), "a" : { "b" : 23, "c" : 44 } }
      //
      // Note, how second time the return set of keys is different.

      var currentPath = fullPath;
      var anotherPath = path;
      throw MinimongoError("both " + currentPath + " and " + anotherPath +
                           " found in fields option, using both of them may trigger " +
                           "unexpected behavior. Did you mean to use only one of them?");
    });

  return {
    tree: projectionRulesTree,
    including: including
  };
};

// paths - Array: list of mongo style paths
// newLeafFn - Function: of form function(path) should return a scalar value to
//                       put into list created for that path
// conflictFn - Function: of form function(node, path, fullPath) is called
//                        when building a tree path for 'fullPath' node on
//                        'path' was already a leaf with a value. Must return a
//                        conflict resolution.
// initial tree - Optional Object: starting tree.
// @returns - Object: tree represented as a set of nested objects
pathsToTree = function (paths, newLeafFn, conflictFn, tree) {
  tree = tree || {};
  _.each(paths, function (keyPath) {
    var treePos = tree;
    var pathArr = keyPath.split('.');

    // use _.all just for iteration with break
    var success = _.all(pathArr.slice(0, -1), function (key, idx) {
      if (!_.has(treePos, key))
        treePos[key] = {};
      else if (!_.isObject(treePos[key])) {
        treePos[key] = conflictFn(treePos[key],
                                  pathArr.slice(0, idx + 1).join('.'),
                                  keyPath);
        // break out of loop if we are failing for this path
        if (!_.isObject(treePos[key]))
          return false;
      }

      treePos = treePos[key];
      return true;
    });

    if (success) {
      var lastKey = _.last(pathArr);
      if (!_.has(treePos, lastKey))
        treePos[lastKey] = newLeafFn(keyPath);
      else
        treePos[lastKey] = conflictFn(treePos[lastKey], keyPath, keyPath);
    }
  });

  return tree;
};

LocalCollection._checkSupportedProjection = function (fields) {
  if (!_.isObject(fields) || _.isArray(fields))
    throw MinimongoError("fields option must be an object");

  _.each(fields, function (val, keyPath) {
    if (_.contains(keyPath.split('.'), '$'))
      throw MinimongoError("Minimongo doesn't support $ operator in projections yet.");
    if (_.indexOf([1, 0, true, false], val) === -1)
      throw MinimongoError("Projection values should be one of 1, 0, true, or false");
  });
};


},{}],12:[function(require,module,exports){
// The minimongo selector compiler!

// Terminology:
//  - a "selector" is the EJSON object representing a selector
//  - a "matcher" is its compiled form (whether a full Minimongo.Matcher
//    object or one of the component lambdas that matches parts of it)
//  - a "result object" is an object with a "result" field and maybe
//    distance and arrayIndices.
//  - a "branched value" is an object with a "value" field and maybe
//    "dontIterate" and "arrayIndices".
//  - a "document" is a top-level object that can be stored in a collection.
//  - a "lookup function" is a function that takes in a document and returns
//    an array of "branched values".
//  - a "branched matcher" maps from an array of branched values to a result
//    object.
//  - an "element matcher" maps from a single value to a bool.

// Main entry point.
//   var matcher = new Minimongo.Matcher({a: {$gt: 5}});
//   if (matcher.documentMatches({a: 7})) ...
Minimongo.Matcher = function (selector) {
  var self = this;
  // A set (object mapping string -> *) of all of the document paths looked
  // at by the selector. Also includes the empty string if it may look at any
  // path (eg, $where).
  self._paths = {};
  // Set to true if compilation finds a $near.
  self._hasGeoQuery = false;
  // Set to true if compilation finds a $where.
  self._hasWhere = false;
  // Set to false if compilation finds anything other than a simple equality or
  // one or more of '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin' used with
  // scalars as operands.
  self._isSimple = true;
  // Set to a dummy document which always matches this Matcher. Or set to null
  // if such document is too hard to find.
  self._matchingDocument = undefined;
  // A clone of the original selector. It may just be a function if the user
  // passed in a function; otherwise is definitely an object (eg, IDs are
  // translated into {_id: ID} first. Used by canBecomeTrueByModifier and
  // Sorter._useWithMatcher.
  self._selector = null;
  self._docMatcher = self._compileSelector(selector);
};

_.extend(Minimongo.Matcher.prototype, {
  documentMatches: function (doc) {
    if (!doc || typeof doc !== "object") {
      throw Error("documentMatches needs a document");
    }
    return this._docMatcher(doc);
  },
  hasGeoQuery: function () {
    return this._hasGeoQuery;
  },
  hasWhere: function () {
    return this._hasWhere;
  },
  isSimple: function () {
    return this._isSimple;
  },

  // Given a selector, return a function that takes one argument, a
  // document. It returns a result object.
  _compileSelector: function (selector) {
    var self = this;
    // you can pass a literal function instead of a selector
    if (selector instanceof Function) {
      self._isSimple = false;
      self._selector = selector;
      self._recordPathUsed('');
      return function (doc) {
        return {result: !!selector.call(doc)};
      };
    }

    // shorthand -- scalars match _id
    if (LocalCollection._selectorIsId(selector)) {
      self._selector = {_id: selector};
      self._recordPathUsed('_id');
      return function (doc) {
        return {result: EJSON.equals(doc._id, selector)};
      };
    }

    // protect against dangerous selectors.  falsey and {_id: falsey} are both
    // likely programmer error, and not what you want, particularly for
    // destructive operations.
    if (!selector || (('_id' in selector) && !selector._id)) {
      self._isSimple = false;
      return nothingMatcher;
    }

    // Top level can't be an array or true or binary.
    if (typeof(selector) === 'boolean' || isArray(selector) ||
        EJSON.isBinary(selector))
      throw new Error("Invalid selector: " + selector);

    self._selector = EJSON.clone(selector);
    return compileDocumentSelector(selector, self, {isRoot: true});
  },
  _recordPathUsed: function (path) {
    this._paths[path] = true;
  },
  // Returns a list of key paths the given selector is looking for. It includes
  // the empty string if there is a $where.
  _getPaths: function () {
    return _.keys(this._paths);
  }
});


// Takes in a selector that could match a full document (eg, the original
// selector). Returns a function mapping document->result object.
//
// matcher is the Matcher object we are compiling.
//
// If this is the root document selector (ie, not wrapped in $and or the like),
// then isRoot is true. (This is used by $near.)
var compileDocumentSelector = function (docSelector, matcher, options) {
  options = options || {};
  var docMatchers = [];
  _.each(docSelector, function (subSelector, key) {
    if (key.substr(0, 1) === '$') {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!_.has(LOGICAL_OPERATORS, key))
        throw new Error("Unrecognized logical operator: " + key);
      matcher._isSimple = false;
      docMatchers.push(LOGICAL_OPERATORS[key](subSelector, matcher,
                                              options.inElemMatch));
    } else {
      // Record this path, but only if we aren't in an elemMatcher, since in an
      // elemMatch this is a path inside an object in an array, not in the doc
      // root.
      if (!options.inElemMatch)
        matcher._recordPathUsed(key);
      var lookUpByIndex = makeLookupFunction(key);
      var valueMatcher =
        compileValueSelector(subSelector, matcher, options.isRoot);
      docMatchers.push(function (doc) {
        var branchValues = lookUpByIndex(doc);
        return valueMatcher(branchValues);
      });
    }
  });

  return andDocumentMatchers(docMatchers);
};

// Takes in a selector that could match a key-indexed value in a document; eg,
// {$gt: 5, $lt: 9}, or a regular expression, or any non-expression object (to
// indicate equality).  Returns a branched matcher: a function mapping
// [branched value]->result object.
var compileValueSelector = function (valueSelector, matcher, isRoot) {
  if (valueSelector instanceof RegExp) {
    matcher._isSimple = false;
    return convertElementMatcherToBranchedMatcher(
      regexpElementMatcher(valueSelector));
  } else if (isOperatorObject(valueSelector)) {
    return operatorBranchedMatcher(valueSelector, matcher, isRoot);
  } else {
    return convertElementMatcherToBranchedMatcher(
      equalityElementMatcher(valueSelector));
  }
};

// Given an element matcher (which evaluates a single value), returns a branched
// value (which evaluates the element matcher on all the branches and returns a
// more structured return value possibly including arrayIndices).
var convertElementMatcherToBranchedMatcher = function (
    elementMatcher, options) {
  options = options || {};
  return function (branches) {
    var expanded = branches;
    if (!options.dontExpandLeafArrays) {
      expanded = expandArraysInBranches(
        branches, options.dontIncludeLeafArrays);
    }
    var ret = {};
    ret.result = _.any(expanded, function (element) {
      var matched = elementMatcher(element.value);

      // Special case for $elemMatch: it means "true, and use this as an array
      // index if I didn't already have one".
      if (typeof matched === 'number') {
        // XXX This code dates from when we only stored a single array index
        // (for the outermost array). Should we be also including deeper array
        // indices from the $elemMatch match?
        if (!element.arrayIndices)
          element.arrayIndices = [matched];
        matched = true;
      }

      // If some element matched, and it's tagged with array indices, include
      // those indices in our result object.
      if (matched && element.arrayIndices)
        ret.arrayIndices = element.arrayIndices;

      return matched;
    });
    return ret;
  };
};

// Takes a RegExp object and returns an element matcher.
regexpElementMatcher = function (regexp) {
  return function (value) {
    if (value instanceof RegExp) {
      // Comparing two regexps means seeing if the regexps are identical
      // (really!). Underscore knows how.
      return _.isEqual(value, regexp);
    }
    // Regexps only work against strings.
    if (typeof value !== 'string')
      return false;

    // Reset regexp's state to avoid inconsistent matching for objects with the
    // same value on consecutive calls of regexp.test. This happens only if the
    // regexp has the 'g' flag. Also note that ES6 introduces a new flag 'y' for
    // which we should *not* change the lastIndex but MongoDB doesn't support
    // either of these flags.
    regexp.lastIndex = 0;

    return regexp.test(value);
  };
};

// Takes something that is not an operator object and returns an element matcher
// for equality with that thing.
equalityElementMatcher = function (elementSelector) {
  if (isOperatorObject(elementSelector))
    throw Error("Can't create equalityValueSelector for operator object");

  // Special-case: null and undefined are equal (if you got undefined in there
  // somewhere, or if you got it due to some branch being non-existent in the
  // weird special case), even though they aren't with EJSON.equals.
  if (elementSelector == null) {  // undefined or null
    return function (value) {
      return value == null;  // undefined or null
    };
  }

  return function (value) {
    return LocalCollection._f._equal(elementSelector, value);
  };
};

// Takes an operator object (an object with $ keys) and returns a branched
// matcher for it.
var operatorBranchedMatcher = function (valueSelector, matcher, isRoot) {
  // Each valueSelector works separately on the various branches.  So one
  // operator can match one branch and another can match another branch.  This
  // is OK.

  var operatorMatchers = [];
  _.each(valueSelector, function (operand, operator) {
    // XXX we should actually implement $eq, which is new in 2.6
    var simpleRange = _.contains(['$lt', '$lte', '$gt', '$gte'], operator) &&
      _.isNumber(operand);
    var simpleInequality = operator === '$ne' && !_.isObject(operand);
    var simpleInclusion = _.contains(['$in', '$nin'], operator) &&
      _.isArray(operand) && !_.any(operand, _.isObject);

    if (! (operator === '$eq' || simpleRange ||
           simpleInclusion || simpleInequality)) {
      matcher._isSimple = false;
    }

    if (_.has(VALUE_OPERATORS, operator)) {
      operatorMatchers.push(
        VALUE_OPERATORS[operator](operand, valueSelector, matcher, isRoot));
    } else if (_.has(ELEMENT_OPERATORS, operator)) {
      var options = ELEMENT_OPERATORS[operator];
      operatorMatchers.push(
        convertElementMatcherToBranchedMatcher(
          options.compileElementSelector(
            operand, valueSelector, matcher),
          options));
    } else {
      throw new Error("Unrecognized operator: " + operator);
    }
  });

  return andBranchedMatchers(operatorMatchers);
};

var compileArrayOfDocumentSelectors = function (
    selectors, matcher, inElemMatch) {
  if (!isArray(selectors) || _.isEmpty(selectors))
    throw Error("$and/$or/$nor must be nonempty array");
  return _.map(selectors, function (subSelector) {
    if (!isPlainObject(subSelector))
      throw Error("$or/$and/$nor entries need to be full objects");
    return compileDocumentSelector(
      subSelector, matcher, {inElemMatch: inElemMatch});
  });
};

// Operators that appear at the top level of a document selector.
var LOGICAL_OPERATORS = {
  $and: function (subSelector, matcher, inElemMatch) {
    var matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);
    return andDocumentMatchers(matchers);
  },

  $or: function (subSelector, matcher, inElemMatch) {
    var matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);

    // Special case: if there is only one matcher, use it directly, *preserving*
    // any arrayIndices it returns.
    if (matchers.length === 1)
      return matchers[0];

    return function (doc) {
      var result = _.any(matchers, function (f) {
        return f(doc).result;
      });
      // $or does NOT set arrayIndices when it has multiple
      // sub-expressions. (Tested against MongoDB.)
      return {result: result};
    };
  },

  $nor: function (subSelector, matcher, inElemMatch) {
    var matchers = compileArrayOfDocumentSelectors(
      subSelector, matcher, inElemMatch);
    return function (doc) {
      var result = _.all(matchers, function (f) {
        return !f(doc).result;
      });
      // Never set arrayIndices, because we only match if nothing in particular
      // "matched" (and because this is consistent with MongoDB).
      return {result: result};
    };
  },

  $where: function (selectorValue, matcher) {
    // Record that *any* path may be used.
    matcher._recordPathUsed('');
    matcher._hasWhere = true;
    if (!(selectorValue instanceof Function)) {
      // XXX MongoDB seems to have more complex logic to decide where or or not
      // to add "return"; not sure exactly what it is.
      selectorValue = Function("obj", "return " + selectorValue);
    }
    return function (doc) {
      // We make the document available as both `this` and `obj`.
      // XXX not sure what we should do if this throws
      return {result: selectorValue.call(doc, doc)};
    };
  },

  // This is just used as a comment in the query (in MongoDB, it also ends up in
  // query logs); it has no effect on the actual selection.
  $comment: function () {
    return function () {
      return {result: true};
    };
  }
};

// Returns a branched matcher that matches iff the given matcher does not.
// Note that this implicitly "deMorganizes" the wrapped function.  ie, it
// means that ALL branch values need to fail to match innerBranchedMatcher.
var invertBranchedMatcher = function (branchedMatcher) {
  return function (branchValues) {
    var invertMe = branchedMatcher(branchValues);
    // We explicitly choose to strip arrayIndices here: it doesn't make sense to
    // say "update the array element that does not match something", at least
    // in mongo-land.
    return {result: !invertMe.result};
  };
};

// Operators that (unlike LOGICAL_OPERATORS) pertain to individual paths in a
// document, but (unlike ELEMENT_OPERATORS) do not have a simple definition as
// "match each branched value independently and combine with
// convertElementMatcherToBranchedMatcher".
var VALUE_OPERATORS = {
  $not: function (operand, valueSelector, matcher) {
    return invertBranchedMatcher(compileValueSelector(operand, matcher));
  },
  $ne: function (operand) {
    return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(
      equalityElementMatcher(operand)));
  },
  $nin: function (operand) {
    return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(
      ELEMENT_OPERATORS.$in.compileElementSelector(operand)));
  },
  $exists: function (operand) {
    var exists = convertElementMatcherToBranchedMatcher(function (value) {
      return value !== undefined;
    });
    return operand ? exists : invertBranchedMatcher(exists);
  },
  // $options just provides options for $regex; its logic is inside $regex
  $options: function (operand, valueSelector) {
    if (!_.has(valueSelector, '$regex'))
      throw Error("$options needs a $regex");
    return everythingMatcher;
  },
  // $maxDistance is basically an argument to $near
  $maxDistance: function (operand, valueSelector) {
    if (!valueSelector.$near)
      throw Error("$maxDistance needs a $near");
    return everythingMatcher;
  },
  $all: function (operand, valueSelector, matcher) {
    if (!isArray(operand))
      throw Error("$all requires array");
    // Not sure why, but this seems to be what MongoDB does.
    if (_.isEmpty(operand))
      return nothingMatcher;

    var branchedMatchers = [];
    _.each(operand, function (criterion) {
      // XXX handle $all/$elemMatch combination
      if (isOperatorObject(criterion))
        throw Error("no $ expressions in $all");
      // This is always a regexp or equality selector.
      branchedMatchers.push(compileValueSelector(criterion, matcher));
    });
    // andBranchedMatchers does NOT require all selectors to return true on the
    // SAME branch.
    return andBranchedMatchers(branchedMatchers);
  },
  $near: function (operand, valueSelector, matcher, isRoot) {
    if (!isRoot)
      throw Error("$near can't be inside another $ operator");
    matcher._hasGeoQuery = true;

    // There are two kinds of geodata in MongoDB: coordinate pairs and
    // GeoJSON. They use different distance metrics, too. GeoJSON queries are
    // marked with a $geometry property.

    var maxDistance, point, distance;
    if (isPlainObject(operand) && _.has(operand, '$geometry')) {
      // GeoJSON "2dsphere" mode.
      maxDistance = operand.$maxDistance;
      point = operand.$geometry;
      distance = function (value) {
        // XXX: for now, we don't calculate the actual distance between, say,
        // polygon and circle. If people care about this use-case it will get
        // a priority.
        if (!value || !value.type)
          return null;
        if (value.type === "Point") {
          return GeoJSON.pointDistance(point, value);
        } else {
          return GeoJSON.geometryWithinRadius(value, point, maxDistance)
            ? 0 : maxDistance + 1;
        }
      };
    } else {
      maxDistance = valueSelector.$maxDistance;
      if (!isArray(operand) && !isPlainObject(operand))
        throw Error("$near argument must be coordinate pair or GeoJSON");
      point = pointToArray(operand);
      distance = function (value) {
        if (!isArray(value) && !isPlainObject(value))
          return null;
        return distanceCoordinatePairs(point, value);
      };
    }

    return function (branchedValues) {
      // There might be multiple points in the document that match the given
      // field. Only one of them needs to be within $maxDistance, but we need to
      // evaluate all of them and use the nearest one for the implicit sort
      // specifier. (That's why we can't just use ELEMENT_OPERATORS here.)
      //
      // Note: This differs from MongoDB's implementation, where a document will
      // actually show up *multiple times* in the result set, with one entry for
      // each within-$maxDistance branching point.
      branchedValues = expandArraysInBranches(branchedValues);
      var result = {result: false};
      _.each(branchedValues, function (branch) {
        var curDistance = distance(branch.value);
        // Skip branches that aren't real points or are too far away.
        if (curDistance === null || curDistance > maxDistance)
          return;
        // Skip anything that's a tie.
        if (result.distance !== undefined && result.distance <= curDistance)
          return;
        result.result = true;
        result.distance = curDistance;
        if (!branch.arrayIndices)
          delete result.arrayIndices;
        else
          result.arrayIndices = branch.arrayIndices;
      });
      return result;
    };
  }
};

// Helpers for $near.
var distanceCoordinatePairs = function (a, b) {
  a = pointToArray(a);
  b = pointToArray(b);
  var x = a[0] - b[0];
  var y = a[1] - b[1];
  if (_.isNaN(x) || _.isNaN(y))
    return null;
  return Math.sqrt(x * x + y * y);
};
// Makes sure we get 2 elements array and assume the first one to be x and
// the second one to y no matter what user passes.
// In case user passes { lon: x, lat: y } returns [x, y]
var pointToArray = function (point) {
  return _.map(point, _.identity);
};

// Helper for $lt/$gt/$lte/$gte.
var makeInequality = function (cmpValueComparator) {
  return {
    compileElementSelector: function (operand) {
      // Arrays never compare false with non-arrays for any inequality.
      // XXX This was behavior we observed in pre-release MongoDB 2.5, but
      //     it seems to have been reverted.
      //     See https://jira.mongodb.org/browse/SERVER-11444
      if (isArray(operand)) {
        return function () {
          return false;
        };
      }

      // Special case: consider undefined and null the same (so true with
      // $gte/$lte).
      if (operand === undefined)
        operand = null;

      var operandType = LocalCollection._f._type(operand);

      return function (value) {
        if (value === undefined)
          value = null;
        // Comparisons are never true among things of different type (except
        // null vs undefined).
        if (LocalCollection._f._type(value) !== operandType)
          return false;
        return cmpValueComparator(LocalCollection._f._cmp(value, operand));
      };
    }
  };
};

// Each element selector contains:
//  - compileElementSelector, a function with args:
//    - operand - the "right hand side" of the operator
//    - valueSelector - the "context" for the operator (so that $regex can find
//      $options)
//    - matcher - the Matcher this is going into (so that $elemMatch can compile
//      more things)
//    returning a function mapping a single value to bool.
//  - dontExpandLeafArrays, a bool which prevents expandArraysInBranches from
//    being called
//  - dontIncludeLeafArrays, a bool which causes an argument to be passed to
//    expandArraysInBranches if it is called
ELEMENT_OPERATORS = {
  $lt: makeInequality(function (cmpValue) {
    return cmpValue < 0;
  }),
  $gt: makeInequality(function (cmpValue) {
    return cmpValue > 0;
  }),
  $lte: makeInequality(function (cmpValue) {
    return cmpValue <= 0;
  }),
  $gte: makeInequality(function (cmpValue) {
    return cmpValue >= 0;
  }),
  $mod: {
    compileElementSelector: function (operand) {
      if (!(isArray(operand) && operand.length === 2
            && typeof(operand[0]) === 'number'
            && typeof(operand[1]) === 'number')) {
        throw Error("argument to $mod must be an array of two numbers");
      }
      // XXX could require to be ints or round or something
      var divisor = operand[0];
      var remainder = operand[1];
      return function (value) {
        return typeof value === 'number' && value % divisor === remainder;
      };
    }
  },
  $in: {
    compileElementSelector: function (operand) {
      if (!isArray(operand))
        throw Error("$in needs an array");

      var elementMatchers = [];
      _.each(operand, function (option) {
        if (option instanceof RegExp)
          elementMatchers.push(regexpElementMatcher(option));
        else if (isOperatorObject(option))
          throw Error("cannot nest $ under $in");
        else
          elementMatchers.push(equalityElementMatcher(option));
      });

      return function (value) {
        // Allow {a: {$in: [null]}} to match when 'a' does not exist.
        if (value === undefined)
          value = null;
        return _.any(elementMatchers, function (e) {
          return e(value);
        });
      };
    }
  },
  $size: {
    // {a: [[5, 5]]} must match {a: {$size: 1}} but not {a: {$size: 2}}, so we
    // don't want to consider the element [5,5] in the leaf array [[5,5]] as a
    // possible value.
    dontExpandLeafArrays: true,
    compileElementSelector: function (operand) {
      if (typeof operand === 'string') {
        // Don't ask me why, but by experimentation, this seems to be what Mongo
        // does.
        operand = 0;
      } else if (typeof operand !== 'number') {
        throw Error("$size needs a number");
      }
      return function (value) {
        return isArray(value) && value.length === operand;
      };
    }
  },
  $type: {
    // {a: [5]} must not match {a: {$type: 4}} (4 means array), but it should
    // match {a: {$type: 1}} (1 means number), and {a: [[5]]} must match {$a:
    // {$type: 4}}. Thus, when we see a leaf array, we *should* expand it but
    // should *not* include it itself.
    dontIncludeLeafArrays: true,
    compileElementSelector: function (operand) {
      if (typeof operand !== 'number')
        throw Error("$type needs a number");
      return function (value) {
        return value !== undefined
          && LocalCollection._f._type(value) === operand;
      };
    }
  },
  $regex: {
    compileElementSelector: function (operand, valueSelector) {
      if (!(typeof operand === 'string' || operand instanceof RegExp))
        throw Error("$regex has to be a string or RegExp");

      var regexp;
      if (valueSelector.$options !== undefined) {
        // Options passed in $options (even the empty string) always overrides
        // options in the RegExp object itself. (See also
        // Mongo.Collection._rewriteSelector.)

        // Be clear that we only support the JS-supported options, not extended
        // ones (eg, Mongo supports x and s). Ideally we would implement x and s
        // by transforming the regexp, but not today...
        if (/[^gim]/.test(valueSelector.$options))
          throw new Error("Only the i, m, and g regexp options are supported");

        var regexSource = operand instanceof RegExp ? operand.source : operand;
        regexp = new RegExp(regexSource, valueSelector.$options);
      } else if (operand instanceof RegExp) {
        regexp = operand;
      } else {
        regexp = new RegExp(operand);
      }
      return regexpElementMatcher(regexp);
    }
  },
  $elemMatch: {
    dontExpandLeafArrays: true,
    compileElementSelector: function (operand, valueSelector, matcher) {
      if (!isPlainObject(operand))
        throw Error("$elemMatch need an object");

      var subMatcher, isDocMatcher;
      if (isOperatorObject(operand, true)) {
        subMatcher = compileValueSelector(operand, matcher);
        isDocMatcher = false;
      } else {
        // This is NOT the same as compileValueSelector(operand), and not just
        // because of the slightly different calling convention.
        // {$elemMatch: {x: 3}} means "an element has a field x:3", not
        // "consists only of a field x:3". Also, regexps and sub-$ are allowed.
        subMatcher = compileDocumentSelector(operand, matcher,
                                             {inElemMatch: true});
        isDocMatcher = true;
      }

      return function (value) {
        if (!isArray(value))
          return false;
        for (var i = 0; i < value.length; ++i) {
          var arrayElement = value[i];
          var arg;
          if (isDocMatcher) {
            // We can only match {$elemMatch: {b: 3}} against objects.
            // (We can also match against arrays, if there's numeric indices,
            // eg {$elemMatch: {'0.b': 3}} or {$elemMatch: {0: 3}}.)
            if (!isPlainObject(arrayElement) && !isArray(arrayElement))
              return false;
            arg = arrayElement;
          } else {
            // dontIterate ensures that {a: {$elemMatch: {$gt: 5}}} matches
            // {a: [8]} but not {a: [[8]]}
            arg = [{value: arrayElement, dontIterate: true}];
          }
          // XXX support $near in $elemMatch by propagating $distance?
          if (subMatcher(arg).result)
            return i;   // specially understood to mean "use as arrayIndices"
        }
        return false;
      };
    }
  }
};

// makeLookupFunction(key) returns a lookup function.
//
// A lookup function takes in a document and returns an array of matching
// branches.  If no arrays are found while looking up the key, this array will
// have exactly one branches (possibly 'undefined', if some segment of the key
// was not found).
//
// If arrays are found in the middle, this can have more than one element, since
// we "branch". When we "branch", if there are more key segments to look up,
// then we only pursue branches that are plain objects (not arrays or scalars).
// This means we can actually end up with no branches!
//
// We do *NOT* branch on arrays that are found at the end (ie, at the last
// dotted member of the key). We just return that array; if you want to
// effectively "branch" over the array's values, post-process the lookup
// function with expandArraysInBranches.
//
// Each branch is an object with keys:
//  - value: the value at the branch
//  - dontIterate: an optional bool; if true, it means that 'value' is an array
//    that expandArraysInBranches should NOT expand. This specifically happens
//    when there is a numeric index in the key, and ensures the
//    perhaps-surprising MongoDB behavior where {'a.0': 5} does NOT
//    match {a: [[5]]}.
//  - arrayIndices: if any array indexing was done during lookup (either due to
//    explicit numeric indices or implicit branching), this will be an array of
//    the array indices used, from outermost to innermost; it is falsey or
//    absent if no array index is used. If an explicit numeric index is used,
//    the index will be followed in arrayIndices by the string 'x'.
//
//    Note: arrayIndices is used for two purposes. First, it is used to
//    implement the '$' modifier feature, which only ever looks at its first
//    element.
//
//    Second, it is used for sort key generation, which needs to be able to tell
//    the difference between different paths. Moreover, it needs to
//    differentiate between explicit and implicit branching, which is why
//    there's the somewhat hacky 'x' entry: this means that explicit and
//    implicit array lookups will have different full arrayIndices paths. (That
//    code only requires that different paths have different arrayIndices; it
//    doesn't actually "parse" arrayIndices. As an alternative, arrayIndices
//    could contain objects with flags like "implicit", but I think that only
//    makes the code surrounding them more complex.)
//
//    (By the way, this field ends up getting passed around a lot without
//    cloning, so never mutate any arrayIndices field/var in this package!)
//
//
// At the top level, you may only pass in a plain object or array.
//
// See the test 'minimongo - lookup' for some examples of what lookup functions
// return.
makeLookupFunction = function (key, options) {
  options = options || {};
  var parts = key.split('.');
  var firstPart = parts.length ? parts[0] : '';
  var firstPartIsNumeric = isNumericKey(firstPart);
  var nextPartIsNumeric = parts.length >= 2 && isNumericKey(parts[1]);
  var lookupRest;
  if (parts.length > 1) {
    lookupRest = makeLookupFunction(parts.slice(1).join('.'));
  }

  var omitUnnecessaryFields = function (retVal) {
    if (!retVal.dontIterate)
      delete retVal.dontIterate;
    if (retVal.arrayIndices && !retVal.arrayIndices.length)
      delete retVal.arrayIndices;
    return retVal;
  };

  // Doc will always be a plain object or an array.
  // apply an explicit numeric index, an array.
  return function (doc, arrayIndices) {
    if (!arrayIndices)
      arrayIndices = [];

    if (isArray(doc)) {
      // If we're being asked to do an invalid lookup into an array (non-integer
      // or out-of-bounds), return no results (which is different from returning
      // a single undefined result, in that `null` equality checks won't match).
      if (!(firstPartIsNumeric && firstPart < doc.length))
        return [];

      // Remember that we used this array index. Include an 'x' to indicate that
      // the previous index came from being considered as an explicit array
      // index (not branching).
      arrayIndices = arrayIndices.concat(+firstPart, 'x');
    }

    // Do our first lookup.
    var firstLevel = doc[firstPart];

    // If there is no deeper to dig, return what we found.
    //
    // If what we found is an array, most value selectors will choose to treat
    // the elements of the array as matchable values in their own right, but
    // that's done outside of the lookup function. (Exceptions to this are $size
    // and stuff relating to $elemMatch.  eg, {a: {$size: 2}} does not match {a:
    // [[1, 2]]}.)
    //
    // That said, if we just did an *explicit* array lookup (on doc) to find
    // firstLevel, and firstLevel is an array too, we do NOT want value
    // selectors to iterate over it.  eg, {'a.0': 5} does not match {a: [[5]]}.
    // So in that case, we mark the return value as "don't iterate".
    if (!lookupRest) {
      return [omitUnnecessaryFields({
        value: firstLevel,
        dontIterate: isArray(doc) && isArray(firstLevel),
        arrayIndices: arrayIndices})];
    }

    // We need to dig deeper.  But if we can't, because what we've found is not
    // an array or plain object, we're done. If we just did a numeric index into
    // an array, we return nothing here (this is a change in Mongo 2.5 from
    // Mongo 2.4, where {'a.0.b': null} stopped matching {a: [5]}). Otherwise,
    // return a single `undefined` (which can, for example, match via equality
    // with `null`).
    if (!isIndexable(firstLevel)) {
      if (isArray(doc))
        return [];
      return [omitUnnecessaryFields({value: undefined,
                                      arrayIndices: arrayIndices})];
    }

    var result = [];
    var appendToResult = function (more) {
      Array.prototype.push.apply(result, more);
    };

    // Dig deeper: look up the rest of the parts on whatever we've found.
    // (lookupRest is smart enough to not try to do invalid lookups into
    // firstLevel if it's an array.)
    appendToResult(lookupRest(firstLevel, arrayIndices));

    // If we found an array, then in *addition* to potentially treating the next
    // part as a literal integer lookup, we should also "branch": try to look up
    // the rest of the parts on each array element in parallel.
    //
    // In this case, we *only* dig deeper into array elements that are plain
    // objects. (Recall that we only got this far if we have further to dig.)
    // This makes sense: we certainly don't dig deeper into non-indexable
    // objects. And it would be weird to dig into an array: it's simpler to have
    // a rule that explicit integer indexes only apply to an outer array, not to
    // an array you find after a branching search.
    //
    // In the special case of a numeric part in a *sort selector* (not a query
    // selector), we skip the branching: we ONLY allow the numeric part to mean
    // "look up this index" in that case, not "also look up this index in all
    // the elements of the array".
    if (isArray(firstLevel) && !(nextPartIsNumeric && options.forSort)) {
      _.each(firstLevel, function (branch, arrayIndex) {
        if (isPlainObject(branch)) {
          appendToResult(lookupRest(
            branch,
            arrayIndices.concat(arrayIndex)));
        }
      });
    }

    return result;
  };
};
MinimongoTest.makeLookupFunction = makeLookupFunction;

expandArraysInBranches = function (branches, skipTheArrays) {
  var branchesOut = [];
  _.each(branches, function (branch) {
    var thisIsArray = isArray(branch.value);
    // We include the branch itself, *UNLESS* we it's an array that we're going
    // to iterate and we're told to skip arrays.  (That's right, we include some
    // arrays even skipTheArrays is true: these are arrays that were found via
    // explicit numerical indices.)
    if (!(skipTheArrays && thisIsArray && !branch.dontIterate)) {
      branchesOut.push({
        value: branch.value,
        arrayIndices: branch.arrayIndices
      });
    }
    if (thisIsArray && !branch.dontIterate) {
      _.each(branch.value, function (leaf, i) {
        branchesOut.push({
          value: leaf,
          arrayIndices: (branch.arrayIndices || []).concat(i)
        });
      });
    }
  });
  return branchesOut;
};

var nothingMatcher = function (docOrBranchedValues) {
  return {result: false};
};

var everythingMatcher = function (docOrBranchedValues) {
  return {result: true};
};


// NB: We are cheating and using this function to implement "AND" for both
// "document matchers" and "branched matchers". They both return result objects
// but the argument is different: for the former it's a whole doc, whereas for
// the latter it's an array of "branched values".
var andSomeMatchers = function (subMatchers) {
  if (subMatchers.length === 0)
    return everythingMatcher;
  if (subMatchers.length === 1)
    return subMatchers[0];

  return function (docOrBranches) {
    var ret = {};
    ret.result = _.all(subMatchers, function (f) {
      var subResult = f(docOrBranches);
      // Copy a 'distance' number out of the first sub-matcher that has
      // one. Yes, this means that if there are multiple $near fields in a
      // query, something arbitrary happens; this appears to be consistent with
      // Mongo.
      if (subResult.result && subResult.distance !== undefined
          && ret.distance === undefined) {
        ret.distance = subResult.distance;
      }
      // Similarly, propagate arrayIndices from sub-matchers... but to match
      // MongoDB behavior, this time the *last* sub-matcher with arrayIndices
      // wins.
      if (subResult.result && subResult.arrayIndices) {
        ret.arrayIndices = subResult.arrayIndices;
      }
      return subResult.result;
    });

    // If we didn't actually match, forget any extra metadata we came up with.
    if (!ret.result) {
      delete ret.distance;
      delete ret.arrayIndices;
    }
    return ret;
  };
};

var andDocumentMatchers = andSomeMatchers;
var andBranchedMatchers = andSomeMatchers;


// helpers used by compiled selector code
LocalCollection._f = {
  // XXX for _all and _in, consider building 'inquery' at compile time..

  _type: function (v) {
    if (typeof v === "number")
      return 1;
    if (typeof v === "string")
      return 2;
    if (typeof v === "boolean")
      return 8;
    if (isArray(v))
      return 4;
    if (v === null)
      return 10;
    if (v instanceof RegExp)
      // note that typeof(/x/) === "object"
      return 11;
    if (typeof v === "function")
      return 13;
    if (v instanceof Date)
      return 9;
    if (EJSON.isBinary(v))
      return 5;
    if (v instanceof LocalCollection._ObjectID)
      return 7;
    return 3; // object

    // XXX support some/all of these:
    // 14, symbol
    // 15, javascript code with scope
    // 16, 18: 32-bit/64-bit integer
    // 17, timestamp
    // 255, minkey
    // 127, maxkey
  },

  // deep equality test: use for literal document and array matches
  _equal: function (a, b) {
    return EJSON.equals(a, b, {keyOrderSensitive: true});
  },

  // maps a type code to a value that can be used to sort values of
  // different types
  _typeorder: function (t) {
    // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
    // XXX what is the correct sort position for Javascript code?
    // ('100' in the matrix below)
    // XXX minkey/maxkey
    return [-1,  // (not a type)
            1,   // number
            2,   // string
            3,   // object
            4,   // array
            5,   // binary
            -1,  // deprecated
            6,   // ObjectID
            7,   // bool
            8,   // Date
            0,   // null
            9,   // RegExp
            -1,  // deprecated
            100, // JS code
            2,   // deprecated (symbol)
            100, // JS code
            1,   // 32-bit int
            8,   // Mongo timestamp
            1    // 64-bit int
           ][t];
  },

  // compare two values of unknown type according to BSON ordering
  // semantics. (as an extension, consider 'undefined' to be less than
  // any other value.) return negative if a is less, positive if b is
  // less, or 0 if equal
  _cmp: function (a, b) {
    if (a === undefined)
      return b === undefined ? 0 : -1;
    if (b === undefined)
      return 1;
    var ta = LocalCollection._f._type(a);
    var tb = LocalCollection._f._type(b);
    var oa = LocalCollection._f._typeorder(ta);
    var ob = LocalCollection._f._typeorder(tb);
    if (oa !== ob)
      return oa < ob ? -1 : 1;
    if (ta !== tb)
      // XXX need to implement this if we implement Symbol or integers, or
      // Timestamp
      throw Error("Missing type coercion logic in _cmp");
    if (ta === 7) { // ObjectID
      // Convert to string.
      ta = tb = 2;
      a = a.toHexString();
      b = b.toHexString();
    }
    if (ta === 9) { // Date
      // Convert to millis.
      ta = tb = 1;
      a = a.getTime();
      b = b.getTime();
    }

    if (ta === 1) // double
      return a - b;
    if (tb === 2) // string
      return a < b ? -1 : (a === b ? 0 : 1);
    if (ta === 3) { // Object
      // this could be much more efficient in the expected case ...
      var to_array = function (obj) {
        var ret = [];
        for (var key in obj) {
          ret.push(key);
          ret.push(obj[key]);
        }
        return ret;
      };
      return LocalCollection._f._cmp(to_array(a), to_array(b));
    }
    if (ta === 4) { // Array
      for (var i = 0; ; i++) {
        if (i === a.length)
          return (i === b.length) ? 0 : -1;
        if (i === b.length)
          return 1;
        var s = LocalCollection._f._cmp(a[i], b[i]);
        if (s !== 0)
          return s;
      }
    }
    if (ta === 5) { // binary
      // Surprisingly, a small binary blob is always less than a large one in
      // Mongo.
      if (a.length !== b.length)
        return a.length - b.length;
      for (i = 0; i < a.length; i++) {
        if (a[i] < b[i])
          return -1;
        if (a[i] > b[i])
          return 1;
      }
      return 0;
    }
    if (ta === 8) { // boolean
      if (a) return b ? 0 : 1;
      return b ? -1 : 0;
    }
    if (ta === 10) // null
      return 0;
    if (ta === 11) // regexp
      throw Error("Sorting not supported on regular expression"); // XXX
    // 13: javascript code
    // 14: symbol
    // 15: javascript code with scope
    // 16: 32-bit integer
    // 17: timestamp
    // 18: 64-bit integer
    // 255: minkey
    // 127: maxkey
    if (ta === 13) // javascript code
      throw Error("Sorting not supported on Javascript code"); // XXX
    throw Error("Unknown type to sort");
  }
};

// Oddball function used by upsert.
LocalCollection._removeDollarOperators = function (selector) {
  var selectorDoc = {};
  for (var k in selector)
    if (k.substr(0, 1) !== '$')
      selectorDoc[k] = selector[k];
  return selectorDoc;
};

},{}],13:[function(require,module,exports){
// Returns true if the modifier applied to some document may change the result
// of matching the document by selector
// The modifier is always in a form of Object:
//  - $set
//    - 'a.b.22.z': value
//    - 'foo.bar': 42
//  - $unset
//    - 'abc.d': 1
Minimongo.Matcher.prototype.affectedByModifier = function (modifier) {
  var self = this;
  // safe check for $set/$unset being objects
  modifier = _.extend({ $set: {}, $unset: {} }, modifier);
  var modifiedPaths = _.keys(modifier.$set).concat(_.keys(modifier.$unset));
  var meaningfulPaths = self._getPaths();

  return _.any(modifiedPaths, function (path) {
    var mod = path.split('.');
    return _.any(meaningfulPaths, function (meaningfulPath) {
      var sel = meaningfulPath.split('.');
      var i = 0, j = 0;

      while (i < sel.length && j < mod.length) {
        if (isNumericKey(sel[i]) && isNumericKey(mod[j])) {
          // foo.4.bar selector affected by foo.4 modifier
          // foo.3.bar selector unaffected by foo.4 modifier
          if (sel[i] === mod[j])
            i++, j++;
          else
            return false;
        } else if (isNumericKey(sel[i])) {
          // foo.4.bar selector unaffected by foo.bar modifier
          return false;
        } else if (isNumericKey(mod[j])) {
          j++;
        } else if (sel[i] === mod[j])
          i++, j++;
        else
          return false;
      }

      // One is a prefix of another, taking numeric fields into account
      return true;
    });
  });
};

// Minimongo.Sorter gets a similar method, which delegates to a Matcher it made
// for this exact purpose.
Minimongo.Sorter.prototype.affectedByModifier = function (modifier) {
  var self = this;
  return self._selectorForAffectedByModifier.affectedByModifier(modifier);
};

// @param modifier - Object: MongoDB-styled modifier with `$set`s and `$unsets`
//                           only. (assumed to come from oplog)
// @returns - Boolean: if after applying the modifier, selector can start
//                     accepting the modified value.
// NOTE: assumes that document affected by modifier didn't match this Matcher
// before, so if modifier can't convince selector in a positive change it would
// stay 'false'.
// Currently doesn't support $-operators and numeric indices precisely.
Minimongo.Matcher.prototype.canBecomeTrueByModifier = function (modifier) {
  var self = this;
  if (!this.affectedByModifier(modifier))
    return false;

  modifier = _.extend({$set:{}, $unset:{}}, modifier);
  var modifierPaths = _.keys(modifier.$set).concat(_.keys(modifier.$unset));

  if (!self.isSimple())
    return true;

  if (_.any(self._getPaths(), pathHasNumericKeys) ||
      _.any(modifierPaths, pathHasNumericKeys))
    return true;

  // check if there is a $set or $unset that indicates something is an
  // object rather than a scalar in the actual object where we saw $-operator
  // NOTE: it is correct since we allow only scalars in $-operators
  // Example: for selector {'a.b': {$gt: 5}} the modifier {'a.b.c':7} would
  // definitely set the result to false as 'a.b' appears to be an object.
  var expectedScalarIsObject = _.any(self._selector, function (sel, path) {
    if (! isOperatorObject(sel))
      return false;
    return _.any(modifierPaths, function (modifierPath) {
      return startsWith(modifierPath, path + '.');
    });
  });

  if (expectedScalarIsObject)
    return false;

  // See if we can apply the modifier on the ideally matching object. If it
  // still matches the selector, then the modifier could have turned the real
  // object in the database into something matching.
  var matchingDocument = EJSON.clone(self.matchingDocument());

  // The selector is too complex, anything can happen.
  if (matchingDocument === null)
    return true;

  try {
    LocalCollection._modify(matchingDocument, modifier);
  } catch (e) {
    // Couldn't set a property on a field which is a scalar or null in the
    // selector.
    // Example:
    // real document: { 'a.b': 3 }
    // selector: { 'a': 12 }
    // converted selector (ideal document): { 'a': 12 }
    // modifier: { $set: { 'a.b': 4 } }
    // We don't know what real document was like but from the error raised by
    // $set on a scalar field we can reason that the structure of real document
    // is completely different.
    if (e.name === "MinimongoError" && e.setPropertyError)
      return false;
    throw e;
  }

  return self.documentMatches(matchingDocument).result;
};

// Returns an object that would match the selector if possible or null if the
// selector is too complex for us to analyze
// { 'a.b': { ans: 42 }, 'foo.bar': null, 'foo.baz': "something" }
// => { a: { b: { ans: 42 } }, foo: { bar: null, baz: "something" } }
Minimongo.Matcher.prototype.matchingDocument = function () {
  var self = this;

  // check if it was computed before
  if (self._matchingDocument !== undefined)
    return self._matchingDocument;

  // If the analysis of this selector is too hard for our implementation
  // fallback to "YES"
  var fallback = false;
  self._matchingDocument = pathsToTree(self._getPaths(),
    function (path) {
      var valueSelector = self._selector[path];
      if (isOperatorObject(valueSelector)) {
        // if there is a strict equality, there is a good
        // chance we can use one of those as "matching"
        // dummy value
        if (valueSelector.$in) {
          var matcher = new Minimongo.Matcher({ placeholder: valueSelector });

          // Return anything from $in that matches the whole selector for this
          // path. If nothing matches, returns `undefined` as nothing can make
          // this selector into `true`.
          return _.find(valueSelector.$in, function (x) {
            return matcher.documentMatches({ placeholder: x }).result;
          });
        } else if (onlyContainsKeys(valueSelector, ['$gt', '$gte', '$lt', '$lte'])) {
          var lowerBound = -Infinity, upperBound = Infinity;
          _.each(['$lte', '$lt'], function (op) {
            if (_.has(valueSelector, op) && valueSelector[op] < upperBound)
              upperBound = valueSelector[op];
          });
          _.each(['$gte', '$gt'], function (op) {
            if (_.has(valueSelector, op) && valueSelector[op] > lowerBound)
              lowerBound = valueSelector[op];
          });

          var middle = (lowerBound + upperBound) / 2;
          var matcher = new Minimongo.Matcher({ placeholder: valueSelector });
          if (!matcher.documentMatches({ placeholder: middle }).result &&
              (middle === lowerBound || middle === upperBound))
            fallback = true;

          return middle;
        } else if (onlyContainsKeys(valueSelector, ['$nin',' $ne'])) {
          // Since self._isSimple makes sure $nin and $ne are not combined with
          // objects or arrays, we can confidently return an empty object as it
          // never matches any scalar.
          return {};
        } else {
          fallback = true;
        }
      }
      return self._selector[path];
    },
    _.identity /*conflict resolution is no resolution*/);

  if (fallback)
    self._matchingDocument = null;

  return self._matchingDocument;
};

var getPaths = function (sel) {
  return _.keys(new Minimongo.Matcher(sel)._paths);
  return _.chain(sel).map(function (v, k) {
    // we don't know how to handle $where because it can be anything
    if (k === "$where")
      return ''; // matches everything
    // we branch from $or/$and/$nor operator
    if (_.contains(['$or', '$and', '$nor'], k))
      return _.map(v, getPaths);
    // the value is a literal or some comparison operator
    return k;
  }).flatten().uniq().value();
};

// A helper to ensure object has only certain keys
var onlyContainsKeys = function (obj, keys) {
  return _.all(obj, function (v, k) {
    return _.contains(keys, k);
  });
};

var pathHasNumericKeys = function (path) {
  return _.any(path.split('.'), isNumericKey);
}

// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
var startsWith = function(str, starts) {
  return str.length >= starts.length &&
    str.substring(0, starts.length) === starts;
};


},{}],14:[function(require,module,exports){
// Knows how to combine a mongo selector and a fields projection to a new fields
// projection taking into account active fields from the passed selector.
// @returns Object - projection object (same as fields option of mongo cursor)
Minimongo.Matcher.prototype.combineIntoProjection = function (projection) {
  var self = this;
  var selectorPaths = Minimongo._pathsElidingNumericKeys(self._getPaths());

  // Special case for $where operator in the selector - projection should depend
  // on all fields of the document. getSelectorPaths returns a list of paths
  // selector depends on. If one of the paths is '' (empty string) representing
  // the root or the whole document, complete projection should be returned.
  if (_.contains(selectorPaths, ''))
    return {};

  return combineImportantPathsIntoProjection(selectorPaths, projection);
};

Minimongo._pathsElidingNumericKeys = function (paths) {
  var self = this;
  return _.map(paths, function (path) {
    return _.reject(path.split('.'), isNumericKey).join('.');
  });
};

combineImportantPathsIntoProjection = function (paths, projection) {
  var prjDetails = projectionDetails(projection);
  var tree = prjDetails.tree;
  var mergedProjection = {};

  // merge the paths to include
  tree = pathsToTree(paths,
                     function (path) { return true; },
                     function (node, path, fullPath) { return true; },
                     tree);
  mergedProjection = treeToPaths(tree);
  if (prjDetails.including) {
    // both selector and projection are pointing on fields to include
    // so we can just return the merged tree
    return mergedProjection;
  } else {
    // selector is pointing at fields to include
    // projection is pointing at fields to exclude
    // make sure we don't exclude important paths
    var mergedExclProjection = {};
    _.each(mergedProjection, function (incl, path) {
      if (!incl)
        mergedExclProjection[path] = false;
    });

    return mergedExclProjection;
  }
};

// Returns a set of key paths similar to
// { 'foo.bar': 1, 'a.b.c': 1 }
var treeToPaths = function (tree, prefix) {
  prefix = prefix || '';
  var result = {};

  _.each(tree, function (val, key) {
    if (_.isObject(val))
      _.extend(result, treeToPaths(val, prefix + key + '.'));
    else
      result[prefix + key] = val;
  });

  return result;
};


},{}],15:[function(require,module,exports){
// Give a sort spec, which can be in any of these forms:
//   {"key1": 1, "key2": -1}
//   [["key1", "asc"], ["key2", "desc"]]
//   ["key1", ["key2", "desc"]]
//
// (.. with the first form being dependent on the key enumeration
// behavior of your javascript VM, which usually does what you mean in
// this case if the key names don't look like integers ..)
//
// return a function that takes two objects, and returns -1 if the
// first object comes first in order, 1 if the second object comes
// first, or 0 if neither object comes before the other.

Minimongo.Sorter = function (spec, options) {
  var self = this;
  options = options || {};

  self._sortSpecParts = [];

  var addSpecPart = function (path, ascending) {
    if (!path)
      throw Error("sort keys must be non-empty");
    if (path.charAt(0) === '$')
      throw Error("unsupported sort key: " + path);
    self._sortSpecParts.push({
      path: path,
      lookup: makeLookupFunction(path, {forSort: true}),
      ascending: ascending
    });
  };

  if (spec instanceof Array) {
    for (var i = 0; i < spec.length; i++) {
      if (typeof spec[i] === "string") {
        addSpecPart(spec[i], true);
      } else {
        addSpecPart(spec[i][0], spec[i][1] !== "desc");
      }
    }
  } else if (typeof spec === "object") {
    _.each(spec, function (value, key) {
      addSpecPart(key, value >= 0);
    });
  } else {
    throw Error("Bad sort specification: " + JSON.stringify(spec));
  }

  // To implement affectedByModifier, we piggy-back on top of Matcher's
  // affectedByModifier code; we create a selector that is affected by the same
  // modifiers as this sort order. This is only implemented on the server.
  if (self.affectedByModifier) {
    var selector = {};
    _.each(self._sortSpecParts, function (spec) {
      selector[spec.path] = 1;
    });
    self._selectorForAffectedByModifier = new Minimongo.Matcher(selector);
  }

  self._keyComparator = composeComparators(
    _.map(self._sortSpecParts, function (spec, i) {
      return self._keyFieldComparator(i);
    }));

  // If you specify a matcher for this Sorter, _keyFilter may be set to a
  // function which selects whether or not a given "sort key" (tuple of values
  // for the different sort spec fields) is compatible with the selector.
  self._keyFilter = null;
  options.matcher && self._useWithMatcher(options.matcher);
};

// In addition to these methods, sorter_project.js defines combineIntoProjection
// on the server only.
_.extend(Minimongo.Sorter.prototype, {
  getComparator: function (options) {
    var self = this;

    // If we have no distances, just use the comparator from the source
    // specification (which defaults to "everything is equal".
    if (!options || !options.distances) {
      return self._getBaseComparator();
    }

    var distances = options.distances;

    // Return a comparator which first tries the sort specification, and if that
    // says "it's equal", breaks ties using $near distances.
    return composeComparators([self._getBaseComparator(), function (a, b) {
      if (!distances.has(a._id))
        throw Error("Missing distance for " + a._id);
      if (!distances.has(b._id))
        throw Error("Missing distance for " + b._id);
      return distances.get(a._id) - distances.get(b._id);
    }]);
  },

  _getPaths: function () {
    var self = this;
    return _.pluck(self._sortSpecParts, 'path');
  },

  // Finds the minimum key from the doc, according to the sort specs.  (We say
  // "minimum" here but this is with respect to the sort spec, so "descending"
  // sort fields mean we're finding the max for that field.)
  //
  // Note that this is NOT "find the minimum value of the first field, the
  // minimum value of the second field, etc"... it's "choose the
  // lexicographically minimum value of the key vector, allowing only keys which
  // you can find along the same paths".  ie, for a doc {a: [{x: 0, y: 5}, {x:
  // 1, y: 3}]} with sort spec {'a.x': 1, 'a.y': 1}, the only keys are [0,5] and
  // [1,3], and the minimum key is [0,5]; notably, [0,3] is NOT a key.
  _getMinKeyFromDoc: function (doc) {
    var self = this;
    var minKey = null;

    self._generateKeysFromDoc(doc, function (key) {
      if (!self._keyCompatibleWithSelector(key))
        return;

      if (minKey === null) {
        minKey = key;
        return;
      }
      if (self._compareKeys(key, minKey) < 0) {
        minKey = key;
      }
    });

    // This could happen if our key filter somehow filters out all the keys even
    // though somehow the selector matches.
    if (minKey === null)
      throw Error("sort selector found no keys in doc?");
    return minKey;
  },

  _keyCompatibleWithSelector: function (key) {
    var self = this;
    return !self._keyFilter || self._keyFilter(key);
  },

  // Iterates over each possible "key" from doc (ie, over each branch), calling
  // 'cb' with the key.
  _generateKeysFromDoc: function (doc, cb) {
    var self = this;

    if (self._sortSpecParts.length === 0)
      throw new Error("can't generate keys without a spec");

    // maps index -> ({'' -> value} or {path -> value})
    var valuesByIndexAndPath = [];

    var pathFromIndices = function (indices) {
      return indices.join(',') + ',';
    };

    var knownPaths = null;

    _.each(self._sortSpecParts, function (spec, whichField) {
      // Expand any leaf arrays that we find, and ignore those arrays
      // themselves.  (We never sort based on an array itself.)
      var branches = expandArraysInBranches(spec.lookup(doc), true);

      // If there are no values for a key (eg, key goes to an empty array),
      // pretend we found one null value.
      if (!branches.length)
        branches = [{value: null}];

      var usedPaths = false;
      valuesByIndexAndPath[whichField] = {};
      _.each(branches, function (branch) {
        if (!branch.arrayIndices) {
          // If there are no array indices for a branch, then it must be the
          // only branch, because the only thing that produces multiple branches
          // is the use of arrays.
          if (branches.length > 1)
            throw Error("multiple branches but no array used?");
          valuesByIndexAndPath[whichField][''] = branch.value;
          return;
        }

        usedPaths = true;
        var path = pathFromIndices(branch.arrayIndices);
        if (_.has(valuesByIndexAndPath[whichField], path))
          throw Error("duplicate path: " + path);
        valuesByIndexAndPath[whichField][path] = branch.value;

        // If two sort fields both go into arrays, they have to go into the
        // exact same arrays and we have to find the same paths.  This is
        // roughly the same condition that makes MongoDB throw this strange
        // error message.  eg, the main thing is that if sort spec is {a: 1,
        // b:1} then a and b cannot both be arrays.
        //
        // (In MongoDB it seems to be OK to have {a: 1, 'a.x.y': 1} where 'a'
        // and 'a.x.y' are both arrays, but we don't allow this for now.
        // #NestedArraySort
        // XXX achieve full compatibility here
        if (knownPaths && !_.has(knownPaths, path)) {
          throw Error("cannot index parallel arrays");
        }
      });

      if (knownPaths) {
        // Similarly to above, paths must match everywhere, unless this is a
        // non-array field.
        if (!_.has(valuesByIndexAndPath[whichField], '') &&
            _.size(knownPaths) !== _.size(valuesByIndexAndPath[whichField])) {
          throw Error("cannot index parallel arrays!");
        }
      } else if (usedPaths) {
        knownPaths = {};
        _.each(valuesByIndexAndPath[whichField], function (x, path) {
          knownPaths[path] = true;
        });
      }
    });

    if (!knownPaths) {
      // Easy case: no use of arrays.
      var soleKey = _.map(valuesByIndexAndPath, function (values) {
        if (!_.has(values, ''))
          throw Error("no value in sole key case?");
        return values[''];
      });
      cb(soleKey);
      return;
    }

    _.each(knownPaths, function (x, path) {
      var key = _.map(valuesByIndexAndPath, function (values) {
        if (_.has(values, ''))
          return values[''];
        if (!_.has(values, path))
          throw Error("missing path?");
        return values[path];
      });
      cb(key);
    });
  },

  // Takes in two keys: arrays whose lengths match the number of spec
  // parts. Returns negative, 0, or positive based on using the sort spec to
  // compare fields.
  _compareKeys: function (key1, key2) {
    var self = this;
    if (key1.length !== self._sortSpecParts.length ||
        key2.length !== self._sortSpecParts.length) {
      throw Error("Key has wrong length");
    }

    return self._keyComparator(key1, key2);
  },

  // Given an index 'i', returns a comparator that compares two key arrays based
  // on field 'i'.
  _keyFieldComparator: function (i) {
    var self = this;
    var invert = !self._sortSpecParts[i].ascending;
    return function (key1, key2) {
      var compare = LocalCollection._f._cmp(key1[i], key2[i]);
      if (invert)
        compare = -compare;
      return compare;
    };
  },

  // Returns a comparator that represents the sort specification (but not
  // including a possible geoquery distance tie-breaker).
  _getBaseComparator: function () {
    var self = this;

    // If we're only sorting on geoquery distance and no specs, just say
    // everything is equal.
    if (!self._sortSpecParts.length) {
      return function (doc1, doc2) {
        return 0;
      };
    }

    return function (doc1, doc2) {
      var key1 = self._getMinKeyFromDoc(doc1);
      var key2 = self._getMinKeyFromDoc(doc2);
      return self._compareKeys(key1, key2);
    };
  },

  // In MongoDB, if you have documents
  //    {_id: 'x', a: [1, 10]} and
  //    {_id: 'y', a: [5, 15]},
  // then C.find({}, {sort: {a: 1}}) puts x before y (1 comes before 5).
  // But  C.find({a: {$gt: 3}}, {sort: {a: 1}}) puts y before x (1 does not
  // match the selector, and 5 comes before 10).
  //
  // The way this works is pretty subtle!  For example, if the documents
  // are instead {_id: 'x', a: [{x: 1}, {x: 10}]}) and
  //             {_id: 'y', a: [{x: 5}, {x: 15}]}),
  // then C.find({'a.x': {$gt: 3}}, {sort: {'a.x': 1}}) and
  //      C.find({a: {$elemMatch: {x: {$gt: 3}}}}, {sort: {'a.x': 1}})
  // both follow this rule (y before x).  (ie, you do have to apply this
  // through $elemMatch.)
  //
  // So if you pass a matcher to this sorter's constructor, we will attempt to
  // skip sort keys that don't match the selector. The logic here is pretty
  // subtle and undocumented; we've gotten as close as we can figure out based
  // on our understanding of Mongo's behavior.
  _useWithMatcher: function (matcher) {
    var self = this;

    if (self._keyFilter)
      throw Error("called _useWithMatcher twice?");

    // If we are only sorting by distance, then we're not going to bother to
    // build a key filter.
    // XXX figure out how geoqueries interact with this stuff
    if (_.isEmpty(self._sortSpecParts))
      return;

    var selector = matcher._selector;

    // If the user just passed a literal function to find(), then we can't get a
    // key filter from it.
    if (selector instanceof Function)
      return;

    var constraintsByPath = {};
    _.each(self._sortSpecParts, function (spec, i) {
      constraintsByPath[spec.path] = [];
    });

    _.each(selector, function (subSelector, key) {
      // XXX support $and and $or

      var constraints = constraintsByPath[key];
      if (!constraints)
        return;

      // XXX it looks like the real MongoDB implementation isn't "does the
      // regexp match" but "does the value fall into a range named by the
      // literal prefix of the regexp", ie "foo" in /^foo(bar|baz)+/  But
      // "does the regexp match" is a good approximation.
      if (subSelector instanceof RegExp) {
        // As far as we can tell, using either of the options that both we and
        // MongoDB support ('i' and 'm') disables use of the key filter. This
        // makes sense: MongoDB mostly appears to be calculating ranges of an
        // index to use, which means it only cares about regexps that match
        // one range (with a literal prefix), and both 'i' and 'm' prevent the
        // literal prefix of the regexp from actually meaning one range.
        if (subSelector.ignoreCase || subSelector.multiline)
          return;
        constraints.push(regexpElementMatcher(subSelector));
        return;
      }

      if (isOperatorObject(subSelector)) {
        _.each(subSelector, function (operand, operator) {
          if (_.contains(['$lt', '$lte', '$gt', '$gte'], operator)) {
            // XXX this depends on us knowing that these operators don't use any
            // of the arguments to compileElementSelector other than operand.
            constraints.push(
              ELEMENT_OPERATORS[operator].compileElementSelector(operand));
          }

          // See comments in the RegExp block above.
          if (operator === '$regex' && !subSelector.$options) {
            constraints.push(
              ELEMENT_OPERATORS.$regex.compileElementSelector(
                operand, subSelector));
          }

          // XXX support {$exists: true}, $mod, $type, $in, $elemMatch
        });
        return;
      }

      // OK, it's an equality thing.
      constraints.push(equalityElementMatcher(subSelector));
    });

    // It appears that the first sort field is treated differently from the
    // others; we shouldn't create a key filter unless the first sort field is
    // restricted, though after that point we can restrict the other sort fields
    // or not as we wish.
    if (_.isEmpty(constraintsByPath[self._sortSpecParts[0].path]))
      return;

    self._keyFilter = function (key) {
      return _.all(self._sortSpecParts, function (specPart, index) {
        return _.all(constraintsByPath[specPart.path], function (f) {
          return f(key[index]);
        });
      });
    };
  }
});

// Given an array of comparators
// (functions (a,b)->(negative or positive or zero)), returns a single
// comparator which uses each comparator in order and returns the first
// non-zero value.
var composeComparators = function (comparatorArray) {
  return function (a, b) {
    for (var i = 0; i < comparatorArray.length; ++i) {
      var compare = comparatorArray[i](a, b);
      if (compare !== 0)
        return compare;
    }
    return 0;
  };
};

},{}],16:[function(require,module,exports){
Minimongo.Sorter.prototype.combineIntoProjection = function (projection) {
  var self = this;
  var specPaths = Minimongo._pathsElidingNumericKeys(self._getPaths());
  return combineImportantPathsIntoProjection(specPaths, projection);
};

},{}],17:[function(require,module,exports){
// Wrap a transform function to return objects that have the _id field
// of the untransformed document. This ensures that subsystems such as
// the observe-sequence package that call `observe` can keep track of
// the documents identities.
//
// - Require that it returns objects
// - If the return value has an _id field, verify that it matches the
//   original _id field
// - If the return value doesn't have an _id field, add it back.
LocalCollection.wrapTransform = function (transform) {
  if (! transform)
    return null;

  // No need to doubly-wrap transforms.
  if (transform.__wrappedTransform__)
    return transform;

  var wrapped = function (doc) {
    if (!_.has(doc, '_id')) {
      // XXX do we ever have a transform on the oplog's collection? because that
      // collection has no _id.
      throw new Error("can only transform documents with _id");
    }

    var id = doc._id;
    // XXX consider making tracker a weak dependency and checking Package.tracker here
    var transformed = Tracker.nonreactive(function () {
      return transform(doc);
    });

    if (!isPlainObject(transformed)) {
      throw new Error("transform must return object");
    }

    if (_.has(transformed, '_id')) {
      if (!EJSON.equals(transformed._id, id)) {
        throw new Error("transformed document can't have different _id");
      }
    } else {
      transformed._id = id;
    }
    return transformed;
  };
  wrapped.__wrappedTransform__ = true;
  return wrapped;
};

},{}],18:[function(require,module,exports){
Tinytest.add("minimongo - wrapTransform", function (test) {
  var wrap = LocalCollection.wrapTransform;

  // Transforming no function gives falsey.
  test.isFalse(wrap(undefined));
  test.isFalse(wrap(null));

  // It's OK if you don't change the ID.
  var validTransform = function (doc) {
    delete doc.x;
    doc.y = 42;
    doc.z = function () { return 43; };
    return doc;
  };
  var transformed = wrap(validTransform)({_id: "asdf", x: 54});
  test.equal(_.keys(transformed), ['_id', 'y', 'z']);
  test.equal(transformed.y, 42);
  test.equal(transformed.z(), 43);

  // Ensure that ObjectIDs work (even if the _ids in question are not ===-equal)
  var oid1 = new LocalCollection._ObjectID();
  var oid2 = new LocalCollection._ObjectID(oid1.toHexString());
  test.equal(wrap(function () {return {_id: oid2};})({_id: oid1}),
             {_id: oid2});

  // transform functions must return objects
  var invalidObjects = [
    "asdf", new LocalCollection._ObjectID(), false, null, true,
    27, [123], /adsf/, new Date, function () {}, undefined
  ];
  _.each(invalidObjects, function (invalidObject) {
    var wrapped = wrap(function () { return invalidObject; });
    test.throws(function () {
      wrapped({_id: "asdf"});
    });
  }, /transform must return object/);

  // transform functions may not change _ids
  var wrapped = wrap(function (doc) { doc._id = 'x'; return doc; });
  test.throws(function () {
    wrapped({_id: 'y'});
  }, /can't have different _id/);

  // transform functions may remove _ids
  test.equal({_id: 'a', x: 2},
             wrap(function (d) {delete d._id; return d;})({_id: 'a', x: 2}));

  // test that wrapped transform functions are nonreactive
  var unwrapped = function (doc) {
    test.isFalse(Tracker.active);
    return doc;
  };
  var handle = Tracker.autorun(function () {
    test.isTrue(Tracker.active);
    wrap(unwrapped)({_id: "xxx"});
  });
  handle.stop();
});

},{}]},{},[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
