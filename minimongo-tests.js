var Future;

Meteor.isServer && (Future = Npm.require("fibers/future")), TestCaseResults = function(test_case, onEvent, onException, stop_at_offset) {
    var self = this;
    self.test_case = test_case, self.onEvent = onEvent, self.expecting_failure = !1, 
    self.current_fail_count = 0, self.stop_at_offset = stop_at_offset, self.onException = onException, 
    self.id = Random.id(), self.extraDetails = {};
}, _.extend(TestCaseResults.prototype, {
    ok: function(doc) {
        var self = this, ok = {
            type: "ok"
        };
        doc && (ok.details = doc), self.expecting_failure && (ok.details = ok.details || {}, 
        ok.details.was_expecting_failure = !0, self.expecting_failure = !1), self.onEvent(ok);
    },
    expect_fail: function() {
        var self = this;
        self.expecting_failure = !0;
    },
    fail: function(doc) {
        var self = this;
        if ("string" == typeof doc && (doc = {
            type: "fail",
            message: doc
        }), doc = _.extend({}, doc, self.extraDetails), 0 === self.stop_at_offset) {
            if (Meteor.isClient) {
                var now = +new Date();
                +new Date() - now < 100 && alert("To use this feature, first enable your browser's debugger.");
            }
            self.stop_at_offset = null;
        }
        if (self.stop_at_offset && self.stop_at_offset--, Error.captureStackTrace) {
            var savedPrepareStackTrace = Error.prepareStackTrace;
            Error.prepareStackTrace = function(_, stack) {
                return stack;
            };
            var err = new Error();
            Error.captureStackTrace(err);
            var stack = err.stack;
            Error.prepareStackTrace = savedPrepareStackTrace;
            for (var i = stack.length - 1; i >= 0; --i) {
                var frame = stack[i];
                if (frame.getFileName().match(/:tests\.js/)) {
                    doc.filename = frame.getFileName(), doc.line = frame.getLineNumber();
                    break;
                }
            }
        }
        self.onEvent({
            type: self.expecting_failure ? "expected_fail" : "fail",
            details: doc,
            cookie: {
                name: self.test_case.name,
                offset: self.current_fail_count,
                groupPath: self.test_case.groupPath,
                shortName: self.test_case.shortName
            }
        }), self.expecting_failure = !1, self.current_fail_count++;
    },
    exception: function(exception) {
        this.onException(exception);
    },
    runId: function() {
        return this.id;
    },
    equal: function(actual, expected, message, not) {
        if (!not && "string" == typeof actual && "string" == typeof expected) return void this._stringEqual(actual, expected, message);
        var matched;
        if ("object" == typeof expected && expected && expected.nodeType) matched = expected === actual, 
        expected = "[Node]", actual = "[Unknown]"; else if ("undefined" != typeof Uint8Array && expected instanceof Uint8Array) {
            actual instanceof Uint8Array || this.fail({
                type: "assert_equal",
                message: "found object is not a typed array",
                expected: "A typed array",
                actual: actual.constructor.toString()
            }), expected.length !== actual.length && this.fail({
                type: "assert_equal",
                message: "lengths of typed arrays do not match",
                expected: expected.length,
                actual: actual.length
            });
            for (var i = 0; i < expected.length; i++) this.equal(actual[i], expected[i]);
        } else matched = EJSON.equals(expected, actual);
        matched === !!not ? this.fail({
            type: "assert_equal",
            message: message,
            expected: JSON.stringify(expected),
            actual: JSON.stringify(actual),
            not: !!not
        }) : this.ok();
    },
    notEqual: function(actual, expected, message) {
        this.equal(actual, expected, message, !0);
    },
    instanceOf: function(obj, klass, message) {
        obj instanceof klass ? this.ok() : this.fail({
            type: "instanceOf",
            message: message,
            not: !1
        });
    },
    notInstanceOf: function(obj, klass, message) {
        obj instanceof klass ? this.fail({
            type: "instanceOf",
            message: message,
            not: !0
        }) : this.ok();
    },
    matches: function(actual, regexp, message) {
        regexp.test(actual) ? this.ok() : this.fail({
            type: "matches",
            message: message,
            actual: actual,
            regexp: regexp.toString(),
            not: !1
        });
    },
    notMatches: function(actual, regexp, message) {
        regexp.test(actual) ? this.fail({
            type: "matches",
            message: message,
            actual: actual,
            regexp: regexp.toString(),
            not: !0
        }) : this.ok();
    },
    "throws": function(f, expected) {
        var actual, predicate;
        if (void 0 === expected) predicate = function() {
            return !0;
        }; else if (_.isString(expected)) predicate = function(actual) {
            return _.isString(actual.message) && -1 !== actual.message.indexOf(expected);
        }; else if (expected instanceof RegExp) predicate = function(actual) {
            return expected.test(actual.message);
        }; else {
            if ("function" != typeof expected) throw new Error("expected should be a string, regexp, or predicate function");
            predicate = expected;
        }
        try {
            f();
        } catch (exception) {
            actual = exception;
        }
        actual && predicate(actual) ? this.ok() : this.fail({
            type: "throws",
            message: actual ? "wrong error thrown: " + actual.message : "did not throw an error as expected"
        });
    },
    isTrue: function(v, msg) {
        v ? this.ok() : this.fail({
            type: "true",
            message: msg,
            not: !1
        });
    },
    isFalse: function(v, msg) {
        v ? this.fail({
            type: "true",
            message: msg,
            not: !0
        }) : this.ok();
    },
    isNull: function(v, msg) {
        null === v ? this.ok() : this.fail({
            type: "null",
            message: msg,
            not: !1
        });
    },
    isNotNull: function(v, msg) {
        null === v ? this.fail({
            type: "null",
            message: msg,
            not: !0
        }) : this.ok();
    },
    isUndefined: function(v, msg) {
        void 0 === v ? this.ok() : this.fail({
            type: "undefined",
            message: msg,
            not: !1
        });
    },
    isNotUndefined: function(v, msg) {
        void 0 === v ? this.fail({
            type: "undefined",
            message: msg,
            not: !0
        }) : this.ok();
    },
    isNaN: function(v, msg) {
        isNaN(v) ? this.ok() : this.fail({
            type: "NaN",
            message: msg,
            not: !1
        });
    },
    isNotNaN: function(v, msg) {
        isNaN(v) ? this.fail({
            type: "NaN",
            message: msg,
            not: !0
        }) : this.ok();
    },
    include: function(s, v, message, not) {
        var pass = !1;
        s instanceof Array ? pass = _.any(s, function(it) {
            return _.isEqual(v, it);
        }) : "object" == typeof s ? pass = v in s : "string" == typeof s && s.indexOf(v) > -1 && (pass = !0), 
        pass === !not ? this.ok() : this.fail({
            type: "include",
            message: message,
            sequence: s,
            should_contain_value: v,
            not: !!not
        });
    },
    notInclude: function(s, v, message) {
        this.include(s, v, message, !0);
    },
    length: function(obj, expected_length, msg) {
        obj.length === expected_length ? this.ok() : this.fail({
            type: "length",
            expected: expected_length,
            actual: obj.length,
            message: msg
        });
    },
    _stringEqual: function(actual, expected, message) {
        actual !== expected ? this.fail({
            type: "string_equal",
            message: message,
            expected: expected,
            actual: actual
        }) : this.ok();
    }
}), TestCase = function(name, func) {
    var self = this;
    self.name = name, self.func = func;
    var nameParts = _.map(name.split(" - "), function(s) {
        return s.replace(/^\s*|\s*$/g, "");
    });
    self.shortName = nameParts.pop(), nameParts.unshift("tinytest"), self.groupPath = nameParts;
}, _.extend(TestCase.prototype, {
    run: function(onEvent, onComplete, onException, stop_at_offset) {
        var self = this, completed = !1, markComplete = function() {
            return completed ? (Meteor._debug("*** Test error -- test '" + self.name + "' returned multiple times."), 
            !1) : (completed = !0, !0);
        }, wrappedOnEvent = function(e) {
            return completed && console.trace("event after complete!"), onEvent(e);
        }, results = new TestCaseResults(self, wrappedOnEvent, function(e) {
            markComplete() && onException(e);
        }, stop_at_offset);
        Meteor.defer(function() {
            try {
                self.func(results, function() {
                    markComplete() && onComplete();
                });
            } catch (e) {
                markComplete() && onException(e);
            }
        });
    }
}), TestManager = function() {
    var self = this;
    self.tests = {}, self.ordered_tests = [], self.testQueue = Meteor.isServer && new Meteor._SynchronousQueue();
}, Meteor.isServer && process.env.TINYTEST_FILTER && (__meteor_runtime_config__.tinytestFilter = process.env.TINYTEST_FILTER), 
_.extend(TestManager.prototype, {
    addCase: function(test) {
        var self = this;
        if (test.name in self.tests) throw new Error("Every test needs a unique name, but there are two tests named '" + test.name + "'");
        __meteor_runtime_config__.tinytestFilter && -1 === test.name.indexOf(__meteor_runtime_config__.tinytestFilter) || (self.tests[test.name] = test, 
        self.ordered_tests.push(test));
    },
    createRun: function(onReport, pathPrefix) {
        var self = this;
        return new TestRun(self, onReport, pathPrefix);
    }
}), TestManager = new TestManager(), TestRun = function(manager, onReport, pathPrefix) {
    var self = this;
    self.manager = manager, self.onReport = onReport, self.next_sequence_number = 0, 
    self._pathPrefix = pathPrefix || [], _.each(self.manager.ordered_tests, function(test) {
        self._prefixMatch(test.groupPath) && self._report(test);
    });
}, _.extend(TestRun.prototype, {
    _prefixMatch: function(testPath) {
        for (var self = this, i = 0; i < self._pathPrefix.length; i++) if (!testPath[i] || self._pathPrefix[i] !== testPath[i]) return !1;
        return !0;
    },
    _runTest: function(test, onComplete, stop_at_offset) {
        var self = this, startTime = +new Date();
        test.run(function(event) {
            test.timedOut || self._report(test, event);
        }, function() {
            if (!test.timedOut) {
                var totalTime = +new Date() - startTime;
                self._report(test, {
                    type: "finish",
                    timeMs: totalTime
                }), onComplete();
            }
        }, function(exception) {
            test.timedOut || (self._report(test, {
                type: "exception",
                details: {
                    message: exception.message,
                    stack: exception.stack
                }
            }), onComplete());
        }, stop_at_offset);
    },
    _runOne: function(test, onComplete, stop_at_offset) {
        var self = this;
        return self._prefixMatch(test.groupPath) ? void (Meteor.isServer ? self.manager.testQueue.queueTask(function() {
            var future = new Future();
            Meteor.setTimeout(function() {
                future.isResolved() || (test.timedOut = !0, self._report(test, {
                    type: "exception",
                    details: {
                        message: "test timed out"
                    }
                }), future["return"]());
            }, 18e4), self._runTest(test, function() {
                future.isResolved() || future["return"]();
            }, stop_at_offset), future.wait(), onComplete && onComplete();
        }) : self._runTest(test, function() {
            onComplete && onComplete();
        }, stop_at_offset)) : void (onComplete && onComplete());
    },
    run: function(onComplete) {
        var self = this, tests = _.clone(self.manager.ordered_tests), reportCurrent = function(name) {
            Meteor.isClient && Tinytest._onCurrentClientTest(name);
        }, runNext = function() {
            if (tests.length) {
                var t = tests.shift();
                reportCurrent(t.name), self._runOne(t, runNext);
            } else reportCurrent(null), onComplete && onComplete();
        };
        runNext();
    },
    debug: function(cookie, onComplete) {
        var self = this, test = self.manager.tests[cookie.name];
        if (!test) throw new Error("No such test '" + cookie.name + "'");
        self._runOne(test, onComplete, cookie.offset);
    },
    _report: function(test, event) {
        var self = this;
        if (event) var events = [ _.extend({
            sequence: self.next_sequence_number++
        }, event) ]; else var events = [];
        self.onReport({
            groupPath: test.groupPath,
            test: test.shortName,
            events: events
        });
    }
}), Tinytest = {}, Tinytest.addAsync = function(name, func) {
    TestManager.addCase(new TestCase(name, func));
}, Tinytest.add = function(name, func) {
    Tinytest.addAsync(name, function(test, onComplete) {
        func(test), onComplete();
    });
}, Tinytest._runTests = function(onReport, onComplete, pathPrefix) {
    var testRun = TestManager.createRun(onReport, pathPrefix);
    testRun.run(onComplete);
}, Tinytest._debugTest = function(cookie, onReport, onComplete) {
    var testRun = TestManager.createRun(onReport);
    testRun.debug(cookie, onComplete);
}, Tinytest._onCurrentClientTest = function() {}, Tinytest._runTestsEverywhere = function(onReport, onComplete, pathPrefix, options) {
    var runId = Random.id(), localComplete = !1, localStarted = !1, remoteComplete = !1, done = !1;
    options = _.extend({
        serial: !0
    }, options);
    var handle, serial = !!options.serial, maybeDone = function() {
        !done && localComplete && remoteComplete && (done = !0, onComplete && onComplete()), 
        serial && remoteComplete && !localStarted && startLocalTests();
    }, startLocalTests = function() {
        localStarted = !0, Tinytest._runTests(onReport, function() {
            localComplete = !0, maybeDone();
        }, pathPrefix);
    };
    Meteor.connection.registerStore(Meteor._ServerTestResultsCollection, {
        update: function(msg) {
            msg.id === runId && (_.each(msg.fields, function(report, key) {
                "complete" !== key && (_.each(report.events, function(event) {
                    delete event.cookie;
                }), report.server = !0, onReport(report));
            }), msg.fields && _.has(msg.fields, "complete") && (remoteComplete = !0, handle.stop(), 
            Meteor.call("tinytest/clearResults", runId), maybeDone()));
        }
    }), handle = Meteor.subscribe(Meteor._ServerTestResultsSubscription, runId), Meteor.call("tinytest/run", runId, pathPrefix, function(error) {
        if (error) throw new Error("Test server returned an error");
    }), serial || startLocalTests();
}, LocalCollection._useOID = !0;

var assert_ordering = function(test, f, values) {
    for (var i = 0; i < values.length; i++) {
        var x = f(values[i], values[i]);
        if (0 !== x && test.fail({
            type: "minimongo-ordering",
            message: "value doesn't order as equal to itself",
            value: JSON.stringify(values[i]),
            should_be_zero_but_got: JSON.stringify(x)
        }), i + 1 < values.length) {
            var less = values[i], more = values[i + 1], x = f(less, more);
            0 > x || test.fail({
                type: "minimongo-ordering",
                message: "ordering test failed",
                first: JSON.stringify(less),
                second: JSON.stringify(more),
                should_be_negative_but_got: JSON.stringify(x)
            }), x = f(more, less), x > 0 || test.fail({
                type: "minimongo-ordering",
                message: "ordering test failed",
                first: JSON.stringify(less),
                second: JSON.stringify(more),
                should_be_positive_but_got: JSON.stringify(x)
            });
        }
    }
}, log_callbacks = function(operations) {
    return {
        addedAt: function(obj, idx, before) {
            delete obj._id, operations.push(EJSON.clone([ "added", obj, idx, before ]));
        },
        changedAt: function(obj, old_obj, at) {
            delete obj._id, delete old_obj._id, operations.push(EJSON.clone([ "changed", obj, at, old_obj ]));
        },
        movedTo: function(obj, old_at, new_at, before) {
            delete obj._id, operations.push(EJSON.clone([ "moved", obj, old_at, new_at, before ]));
        },
        removedAt: function(old_obj, at) {
            var id = old_obj._id;
            delete old_obj._id, operations.push(EJSON.clone([ "removed", id, at, old_obj ]));
        }
    };
};

Tinytest.add("minimongo - basics", function(test) {
    var fluffyKitten_id, count, c = new LocalCollection();
    fluffyKitten_id = c.insert({
        type: "kitten",
        name: "fluffy"
    }), c.insert({
        type: "kitten",
        name: "snookums"
    }), c.insert({
        type: "cryptographer",
        name: "alice"
    }), c.insert({
        type: "cryptographer",
        name: "bob"
    }), c.insert({
        type: "cryptographer",
        name: "cara"
    }), test.equal(c.find().count(), 5), test.equal(c.find({
        type: "kitten"
    }).count(), 2), test.equal(c.find({
        type: "cryptographer"
    }).count(), 3), test.length(c.find({
        type: "kitten"
    }).fetch(), 2), test.length(c.find({
        type: "cryptographer"
    }).fetch(), 3), test.equal(fluffyKitten_id, c.findOne({
        type: "kitten",
        name: "fluffy"
    })._id), c.remove({
        name: "cara"
    }), test.equal(c.find().count(), 4), test.equal(c.find({
        type: "kitten"
    }).count(), 2), test.equal(c.find({
        type: "cryptographer"
    }).count(), 2), test.length(c.find({
        type: "kitten"
    }).fetch(), 2), test.length(c.find({
        type: "cryptographer"
    }).fetch(), 2), count = c.update({
        name: "snookums"
    }, {
        $set: {
            type: "cryptographer"
        }
    }), test.equal(count, 1), test.equal(c.find().count(), 4), test.equal(c.find({
        type: "kitten"
    }).count(), 1), test.equal(c.find({
        type: "cryptographer"
    }).count(), 3), test.length(c.find({
        type: "kitten"
    }).fetch(), 1), test.length(c.find({
        type: "cryptographer"
    }).fetch(), 3), c.remove(null), c.remove(!1), c.remove(void 0), test.equal(c.find().count(), 4), 
    c.remove({
        _id: null
    }), c.remove({
        _id: !1
    }), c.remove({
        _id: void 0
    }), count = c.remove(), test.equal(count, 0), test.equal(c.find().count(), 4), count = c.remove({}), 
    test.equal(count, 4), test.equal(c.find().count(), 0), c.insert({
        _id: 1,
        name: "strawberry",
        tags: [ "fruit", "red", "squishy" ]
    }), c.insert({
        _id: 2,
        name: "apple",
        tags: [ "fruit", "red", "hard" ]
    }), c.insert({
        _id: 3,
        name: "rose",
        tags: [ "flower", "red", "squishy" ]
    }), test.equal(c.find({
        tags: "flower"
    }).count(), 1), test.equal(c.find({
        tags: "fruit"
    }).count(), 2), test.equal(c.find({
        tags: "red"
    }).count(), 3), test.length(c.find({
        tags: "flower"
    }).fetch(), 1), test.length(c.find({
        tags: "fruit"
    }).fetch(), 2), test.length(c.find({
        tags: "red"
    }).fetch(), 3), test.equal(c.findOne(1).name, "strawberry"), test.equal(c.findOne(2).name, "apple"), 
    test.equal(c.findOne(3).name, "rose"), test.equal(c.findOne(4), void 0), test.equal(c.findOne("abc"), void 0), 
    test.equal(c.findOne(void 0), void 0), test.equal(c.find(1).count(), 1), test.equal(c.find(4).count(), 0), 
    test.equal(c.find("abc").count(), 0), test.equal(c.find(void 0).count(), 0), test.equal(c.find().count(), 3), 
    test.equal(c.find(1, {
        skip: 1
    }).count(), 0), test.equal(c.find({
        _id: 1
    }, {
        skip: 1
    }).count(), 0), test.equal(c.find({}, {
        skip: 1
    }).count(), 2), test.equal(c.find({}, {
        skip: 2
    }).count(), 1), test.equal(c.find({}, {
        limit: 2
    }).count(), 2), test.equal(c.find({}, {
        limit: 1
    }).count(), 1), test.equal(c.find({}, {
        skip: 1,
        limit: 1
    }).count(), 1), test.equal(c.find({
        tags: "fruit"
    }, {
        skip: 1
    }).count(), 1), test.equal(c.find({
        tags: "fruit"
    }, {
        limit: 1
    }).count(), 1), test.equal(c.find({
        tags: "fruit"
    }, {
        skip: 1,
        limit: 1
    }).count(), 1), test.equal(c.find(1, {
        sort: [ "_id", "desc" ],
        skip: 1
    }).count(), 0), test.equal(c.find({
        _id: 1
    }, {
        sort: [ "_id", "desc" ],
        skip: 1
    }).count(), 0), test.equal(c.find({}, {
        sort: [ "_id", "desc" ],
        skip: 1
    }).count(), 2), test.equal(c.find({}, {
        sort: [ "_id", "desc" ],
        skip: 2
    }).count(), 1), test.equal(c.find({}, {
        sort: [ "_id", "desc" ],
        limit: 2
    }).count(), 2), test.equal(c.find({}, {
        sort: [ "_id", "desc" ],
        limit: 1
    }).count(), 1), test.equal(c.find({}, {
        sort: [ "_id", "desc" ],
        skip: 1,
        limit: 1
    }).count(), 1), test.equal(c.find({
        tags: "fruit"
    }, {
        sort: [ "_id", "desc" ],
        skip: 1
    }).count(), 1), test.equal(c.find({
        tags: "fruit"
    }, {
        sort: [ "_id", "desc" ],
        limit: 1
    }).count(), 1), test.equal(c.find({
        tags: "fruit"
    }, {
        sort: [ "_id", "desc" ],
        skip: 1,
        limit: 1
    }).count(), 1), c.insert({
        foo: {
            bar: "baz"
        }
    }), test.equal(c.find({
        foo: {
            bam: "baz"
        }
    }).count(), 0), test.equal(c.find({
        foo: {
            bar: "baz"
        }
    }).count(), 1);
}), Tinytest.add("minimongo - cursors", function(test) {
    for (var res, c = new LocalCollection(), i = 0; 20 > i; i++) c.insert({
        i: i
    });
    var q = c.find();
    test.equal(q.count(), 20), res = q.fetch(), test.length(res, 20);
    for (var i = 0; 20 > i; i++) test.equal(res[i].i, i);
    test.length(q.fetch(), 20);
    var count = 0, context = {};
    q.forEach(function(obj, i, cursor) {
        test.equal(obj.i, count++), test.equal(obj.i, i), test.isTrue(context === this), 
        test.isTrue(cursor === q);
    }, context), test.equal(count, 20), test.length(q.fetch(), 20), res = q.map(function(obj, i, cursor) {
        return test.equal(obj.i, i), test.isTrue(context === this), test.isTrue(cursor === q), 
        2 * obj.i;
    }, context), test.length(res, 20);
    for (var i = 0; 20 > i; i++) test.equal(res[i], 2 * i);
    test.length(q.fetch(), 20), test.equal(c.findOne({
        i: 0
    }).i, 0), test.equal(c.findOne({
        i: 1
    }).i, 1);
    var id = c.findOne({
        i: 2
    })._id;
    test.equal(c.findOne(id).i, 2);
}), Tinytest.add("minimongo - transform", function(test) {
    var c = new LocalCollection();
    c.insert({});
    var invalidTransform = function(doc) {
        return doc._id;
    };
    test["throws"](function() {
        c.findOne({}, {
            transform: invalidTransform
        });
    });
    var transformWithoutId = function(doc) {
        return _.omit(doc, "_id");
    };
    test.equal(c.findOne({}, {
        transform: transformWithoutId
    })._id, c.findOne()._id);
}), Tinytest.add("minimongo - misc", function(test) {
    var a = {
        a: [ 1, 2, 3 ],
        b: "x",
        c: !0,
        d: {
            x: 12,
            y: [ 12 ]
        },
        f: null,
        g: new Date()
    }, b = EJSON.clone(a);
    test.equal(a, b), test.isTrue(LocalCollection._f._equal(a, b)), a.a.push(4), test.length(b.a, 3), 
    a.c = !1, test.isTrue(b.c), b.d.z = 15, a.d.z = 14, test.equal(b.d.z, 15), a.d.y.push(88), 
    test.length(b.d.y, 1), test.equal(a.g, b.g), b.g.setDate(b.g.getDate() + 1), test.notEqual(a.g, b.g), 
    a = {
        x: function() {}
    }, b = EJSON.clone(a), a.x.a = 14, test.equal(b.x.a, 14);
}), Tinytest.add("minimongo - lookup", function(test) {
    var lookupA = MinimongoTest.makeLookupFunction("a");
    test.equal(lookupA({}), [ {
        value: void 0
    } ]), test.equal(lookupA({
        a: 1
    }), [ {
        value: 1
    } ]), test.equal(lookupA({
        a: [ 1 ]
    }), [ {
        value: [ 1 ]
    } ]);
    var lookupAX = MinimongoTest.makeLookupFunction("a.x");
    test.equal(lookupAX({
        a: {
            x: 1
        }
    }), [ {
        value: 1
    } ]), test.equal(lookupAX({
        a: {
            x: [ 1 ]
        }
    }), [ {
        value: [ 1 ]
    } ]), test.equal(lookupAX({
        a: 5
    }), [ {
        value: void 0
    } ]), test.equal(lookupAX({
        a: [ {
            x: 1
        }, {
            x: [ 2 ]
        }, {
            y: 3
        } ]
    }), [ {
        value: 1,
        arrayIndices: [ 0 ]
    }, {
        value: [ 2 ],
        arrayIndices: [ 1 ]
    }, {
        value: void 0,
        arrayIndices: [ 2 ]
    } ]);
    var lookupA0X = MinimongoTest.makeLookupFunction("a.0.x");
    test.equal(lookupA0X({
        a: [ {
            x: 1
        } ]
    }), [ {
        value: 1,
        arrayIndices: [ 0, "x" ]
    }, {
        value: void 0,
        arrayIndices: [ 0 ]
    } ]), test.equal(lookupA0X({
        a: [ {
            x: [ 1 ]
        } ]
    }), [ {
        value: [ 1 ],
        arrayIndices: [ 0, "x" ]
    }, {
        value: void 0,
        arrayIndices: [ 0 ]
    } ]), test.equal(lookupA0X({
        a: 5
    }), [ {
        value: void 0
    } ]), test.equal(lookupA0X({
        a: [ {
            x: 1
        }, {
            x: [ 2 ]
        }, {
            y: 3
        } ]
    }), [ {
        value: 1,
        arrayIndices: [ 0, "x" ]
    }, {
        value: void 0,
        arrayIndices: [ 0 ]
    }, {
        value: void 0,
        arrayIndices: [ 1 ]
    }, {
        value: void 0,
        arrayIndices: [ 2 ]
    } ]), test.equal(MinimongoTest.makeLookupFunction("w.x.0.z")({
        w: [ {
            x: [ {
                z: 5
            } ]
        } ]
    }), [ {
        value: 5,
        arrayIndices: [ 0, 0, "x" ]
    }, {
        value: void 0,
        arrayIndices: [ 0, 0 ]
    } ]);
}), Tinytest.add("minimongo - selector_compiler", function(test) {
    var matches = function(shouldMatch, selector, doc) {
        var doesMatch = new Minimongo.Matcher(selector).documentMatches(doc).result;
        doesMatch != shouldMatch && test.fail({
            message: "minimongo match failure: document " + (shouldMatch ? "should match, but doesn't" : "shouldn't match, but does"),
            selector: JSON.stringify(selector),
            document: JSON.stringify(doc)
        });
    }, match = _.bind(matches, null, !0), nomatch = _.bind(matches, null, !1);
    match({}, {}), match({}, {
        a: 12
    }), match(1, {
        _id: 1,
        a: "foo"
    }), nomatch(1, {
        _id: 2,
        a: "foo"
    }), match("a", {
        _id: "a",
        a: "foo"
    }), nomatch("a", {
        _id: "b",
        a: "foo"
    }), nomatch(void 0, {}), nomatch(void 0, {
        _id: "foo"
    }), nomatch(!1, {
        _id: "foo"
    }), nomatch(null, {
        _id: "foo"
    }), nomatch({
        _id: void 0
    }, {
        _id: "foo"
    }), nomatch({
        _id: !1
    }, {
        _id: "foo"
    }), nomatch({
        _id: null
    }, {
        _id: "foo"
    }), nomatch({
        a: 12
    }, {}), match({
        a: 12
    }, {
        a: 12
    }), match({
        a: 12
    }, {
        a: 12,
        b: 13
    }), match({
        a: 12,
        b: 13
    }, {
        a: 12,
        b: 13
    }), match({
        a: 12,
        b: 13
    }, {
        a: 12,
        b: 13,
        c: 14
    }), nomatch({
        a: 12,
        b: 13,
        c: 14
    }, {
        a: 12,
        b: 13
    }), nomatch({
        a: 12,
        b: 13
    }, {
        b: 13,
        c: 14
    }), match({
        a: 12
    }, {
        a: [ 12 ]
    }), match({
        a: 12
    }, {
        a: [ 11, 12, 13 ]
    }), nomatch({
        a: 12
    }, {
        a: [ 11, 13 ]
    }), match({
        a: 12,
        b: 13
    }, {
        a: [ 11, 12, 13 ],
        b: [ 13, 14, 15 ]
    }), nomatch({
        a: 12,
        b: 13
    }, {
        a: [ 11, 12, 13 ],
        b: [ 14, 15 ]
    });
    var date1 = new Date(), date2 = new Date(date1.getTime() + 1e3);
    match({
        a: date1
    }, {
        a: date1
    }), nomatch({
        a: date1
    }, {
        a: date2
    }), match({
        a: [ 1, 2 ]
    }, {
        a: [ 1, 2 ]
    }), match({
        a: [ 1, 2 ]
    }, {
        a: [ [ 1, 2 ] ]
    }), match({
        a: [ 1, 2 ]
    }, {
        a: [ [ 3, 4 ], [ 1, 2 ] ]
    }), nomatch({
        a: [ 1, 2 ]
    }, {
        a: [ 3, 4 ]
    }), nomatch({
        a: [ 1, 2 ]
    }, {
        a: [ [ [ 1, 2 ] ] ]
    }), match({
        a: {
            b: 12
        }
    }, {
        a: {
            b: 12
        }
    }), nomatch({
        a: {
            b: 12,
            c: 13
        }
    }, {
        a: {
            b: 12
        }
    }), nomatch({
        a: {
            b: 12
        }
    }, {
        a: {
            b: 12,
            c: 13
        }
    }), match({
        a: {
            b: 12,
            c: 13
        }
    }, {
        a: {
            b: 12,
            c: 13
        }
    }), nomatch({
        a: {
            b: 12,
            c: 13
        }
    }, {
        a: {
            c: 13,
            b: 12
        }
    }), nomatch({
        a: {}
    }, {
        a: {
            b: 12
        }
    }), nomatch({
        a: {
            b: 12
        }
    }, {
        a: {}
    }), match({
        a: {
            b: 12,
            c: [ 13, !0, !1, 2.2, "a", null, {
                d: 14
            } ]
        }
    }, {
        a: {
            b: 12,
            c: [ 13, !0, !1, 2.2, "a", null, {
                d: 14
            } ]
        }
    }), match({
        a: {
            b: 12
        }
    }, {
        a: {
            b: 12
        },
        k: 99
    }), match({
        a: {
            b: 12
        }
    }, {
        a: [ {
            b: 12
        } ]
    }), nomatch({
        a: {
            b: 12
        }
    }, {
        a: [ [ {
            b: 12
        } ] ]
    }), match({
        a: {
            b: 12
        }
    }, {
        a: [ {
            b: 11
        }, {
            b: 12
        }, {
            b: 13
        } ]
    }), nomatch({
        a: {
            b: 12
        }
    }, {
        a: [ {
            b: 11
        }, {
            b: 12,
            c: 20
        }, {
            b: 13
        } ]
    }), nomatch({
        a: {
            b: 12,
            c: 20
        }
    }, {
        a: [ {
            b: 11
        }, {
            b: 12
        }, {
            c: 20
        } ]
    }), match({
        a: {
            b: 12,
            c: 20
        }
    }, {
        a: [ {
            b: 11
        }, {
            b: 12,
            c: 20
        }, {
            b: 13
        } ]
    }), match({
        a: null
    }, {
        a: null
    }), match({
        a: null
    }, {
        b: 12
    }), nomatch({
        a: null
    }, {
        a: 12
    }), match({
        a: null
    }, {
        a: [ 1, 2, null, 3 ]
    }), nomatch({
        a: null
    }, {
        a: [ 1, 2, {}, 3 ]
    }), match({
        a: {
            $lt: 10
        }
    }, {
        a: 9
    }), nomatch({
        a: {
            $lt: 10
        }
    }, {
        a: 10
    }), nomatch({
        a: {
            $lt: 10
        }
    }, {
        a: 11
    }), match({
        a: {
            $gt: 10
        }
    }, {
        a: 11
    }), nomatch({
        a: {
            $gt: 10
        }
    }, {
        a: 10
    }), nomatch({
        a: {
            $gt: 10
        }
    }, {
        a: 9
    }), match({
        a: {
            $lte: 10
        }
    }, {
        a: 9
    }), match({
        a: {
            $lte: 10
        }
    }, {
        a: 10
    }), nomatch({
        a: {
            $lte: 10
        }
    }, {
        a: 11
    }), match({
        a: {
            $gte: 10
        }
    }, {
        a: 11
    }), match({
        a: {
            $gte: 10
        }
    }, {
        a: 10
    }), nomatch({
        a: {
            $gte: 10
        }
    }, {
        a: 9
    }), match({
        a: {
            $lt: 10
        }
    }, {
        a: [ 11, 9, 12 ]
    }), nomatch({
        a: {
            $lt: 10
        }
    }, {
        a: [ 11, 12 ]
    }), nomatch({
        a: {
            $lt: "null"
        }
    }, {
        a: null
    }), match({
        a: {
            $lt: {
                x: [ 2, 3, 4 ]
            }
        }
    }, {
        a: {
            x: [ 1, 3, 4 ]
        }
    }), match({
        a: {
            $gt: {
                x: [ 2, 3, 4 ]
            }
        }
    }, {
        a: {
            x: [ 3, 3, 4 ]
        }
    }), nomatch({
        a: {
            $gt: {
                x: [ 2, 3, 4 ]
            }
        }
    }, {
        a: {
            x: [ 1, 3, 4 ]
        }
    }), nomatch({
        a: {
            $gt: {
                x: [ 2, 3, 4 ]
            }
        }
    }, {
        a: {
            x: [ 2, 3, 4 ]
        }
    }), nomatch({
        a: {
            $lt: {
                x: [ 2, 3, 4 ]
            }
        }
    }, {
        a: {
            x: [ 2, 3, 4 ]
        }
    }), match({
        a: {
            $gte: {
                x: [ 2, 3, 4 ]
            }
        }
    }, {
        a: {
            x: [ 2, 3, 4 ]
        }
    }), match({
        a: {
            $lte: {
                x: [ 2, 3, 4 ]
            }
        }
    }, {
        a: {
            x: [ 2, 3, 4 ]
        }
    }), nomatch({
        a: {
            $gt: [ 2, 3 ]
        }
    }, {
        a: [ 1, 2 ]
    }), nomatch({
        a: {
            $lt: 11,
            $gt: 9
        }
    }, {
        a: 8
    }), nomatch({
        a: {
            $lt: 11,
            $gt: 9
        }
    }, {
        a: 9
    }), match({
        a: {
            $lt: 11,
            $gt: 9
        }
    }, {
        a: 10
    }), nomatch({
        a: {
            $lt: 11,
            $gt: 9
        }
    }, {
        a: 11
    }), nomatch({
        a: {
            $lt: 11,
            $gt: 9
        }
    }, {
        a: 12
    }), match({
        a: {
            $lt: 11,
            $gt: 9
        }
    }, {
        a: [ 8, 9, 10, 11, 12 ]
    }), match({
        a: {
            $lt: 11,
            $gt: 9
        }
    }, {
        a: [ 8, 9, 11, 12 ]
    }), match({
        a: {
            $all: [ 1, 2 ]
        }
    }, {
        a: [ 1, 2 ]
    }), nomatch({
        a: {
            $all: [ 1, 2, 3 ]
        }
    }, {
        a: [ 1, 2 ]
    }), match({
        a: {
            $all: [ 1, 2 ]
        }
    }, {
        a: [ 3, 2, 1 ]
    }), match({
        a: {
            $all: [ 1, "x" ]
        }
    }, {
        a: [ 3, "x", 1 ]
    }), nomatch({
        a: {
            $all: [ "2" ]
        }
    }, {
        a: 2
    }), nomatch({
        a: {
            $all: [ 2 ]
        }
    }, {
        a: "2"
    }), match({
        a: {
            $all: [ [ 1, 2 ], [ 1, 3 ] ]
        }
    }, {
        a: [ [ 1, 3 ], [ 1, 2 ], [ 1, 4 ] ]
    }), nomatch({
        a: {
            $all: [ [ 1, 2 ], [ 1, 3 ] ]
        }
    }, {
        a: [ [ 1, 4 ], [ 1, 2 ], [ 1, 4 ] ]
    }), match({
        a: {
            $all: [ 2, 2 ]
        }
    }, {
        a: [ 2 ]
    }), nomatch({
        a: {
            $all: [ 2, 3 ]
        }
    }, {
        a: [ 2, 2 ]
    }), nomatch({
        a: {
            $all: [ 1, 2 ]
        }
    }, {
        a: [ [ 1, 2 ] ]
    }), nomatch({
        a: {
            $all: [ 1, 2 ]
        }
    }, {}), nomatch({
        a: {
            $all: [ 1, 2 ]
        }
    }, {
        a: {
            foo: "bar"
        }
    }), nomatch({
        a: {
            $all: []
        }
    }, {
        a: []
    }), nomatch({
        a: {
            $all: []
        }
    }, {
        a: [ 5 ]
    }), match({
        a: {
            $all: [ /i/, /e/i ]
        }
    }, {
        a: [ "foo", "bEr", "biz" ]
    }), nomatch({
        a: {
            $all: [ /i/, /e/i ]
        }
    }, {
        a: [ "foo", "bar", "biz" ]
    }), match({
        a: {
            $all: [ {
                b: 3
            } ]
        }
    }, {
        a: [ {
            b: 3
        } ]
    }), nomatch({
        a: {
            $all: [ {
                b: 3
            } ]
        }
    }, {
        a: [ {
            b: 3,
            k: 4
        } ]
    }), test["throws"](function() {
        match({
            a: {
                $all: [ {
                    $gt: 4
                } ]
            }
        }, {});
    }), match({
        a: {
            $exists: !0
        }
    }, {
        a: 12
    }), nomatch({
        a: {
            $exists: !0
        }
    }, {
        b: 12
    }), nomatch({
        a: {
            $exists: !1
        }
    }, {
        a: 12
    }), match({
        a: {
            $exists: !1
        }
    }, {
        b: 12
    }), match({
        a: {
            $exists: !0
        }
    }, {
        a: []
    }), nomatch({
        a: {
            $exists: !0
        }
    }, {
        b: []
    }), nomatch({
        a: {
            $exists: !1
        }
    }, {
        a: []
    }), match({
        a: {
            $exists: !1
        }
    }, {
        b: []
    }), match({
        a: {
            $exists: !0
        }
    }, {
        a: [ 1 ]
    }), nomatch({
        a: {
            $exists: !0
        }
    }, {
        b: [ 1 ]
    }), nomatch({
        a: {
            $exists: !1
        }
    }, {
        a: [ 1 ]
    }), match({
        a: {
            $exists: !1
        }
    }, {
        b: [ 1 ]
    }), match({
        a: {
            $exists: 1
        }
    }, {
        a: 5
    }), match({
        a: {
            $exists: 0
        }
    }, {
        b: 5
    }), nomatch({
        "a.x": {
            $exists: !1
        }
    }, {
        a: [ {}, {
            x: 5
        } ]
    }), match({
        "a.x": {
            $exists: !0
        }
    }, {
        a: [ {}, {
            x: 5
        } ]
    }), match({
        "a.x": {
            $exists: !0
        }
    }, {
        a: [ {}, {
            x: 5
        } ]
    }), match({
        "a.x": {
            $exists: !0
        }
    }, {
        a: {
            x: []
        }
    }), match({
        "a.x": {
            $exists: !0
        }
    }, {
        a: {
            x: null
        }
    }), match({
        a: {
            $mod: [ 10, 1 ]
        }
    }, {
        a: 11
    }), nomatch({
        a: {
            $mod: [ 10, 1 ]
        }
    }, {
        a: 12
    }), match({
        a: {
            $mod: [ 10, 1 ]
        }
    }, {
        a: [ 10, 11, 12 ]
    }), nomatch({
        a: {
            $mod: [ 10, 1 ]
        }
    }, {
        a: [ 10, 12 ]
    }), _.each([ 5, [ 10 ], [ 10, 1, 2 ], "foo", {
        bar: 1
    }, [] ], function(badMod) {
        test["throws"](function() {
            match({
                a: {
                    $mod: badMod
                }
            }, {
                a: 11
            });
        });
    }), match({
        a: {
            $ne: 1
        }
    }, {
        a: 2
    }), nomatch({
        a: {
            $ne: 2
        }
    }, {
        a: 2
    }), match({
        a: {
            $ne: [ 1 ]
        }
    }, {
        a: [ 2 ]
    }), nomatch({
        a: {
            $ne: [ 1, 2 ]
        }
    }, {
        a: [ 1, 2 ]
    }), nomatch({
        a: {
            $ne: 1
        }
    }, {
        a: [ 1, 2 ]
    }), nomatch({
        a: {
            $ne: 2
        }
    }, {
        a: [ 1, 2 ]
    }), match({
        a: {
            $ne: 3
        }
    }, {
        a: [ 1, 2 ]
    }), nomatch({
        "a.b": {
            $ne: 1
        }
    }, {
        a: [ {
            b: 1
        }, {
            b: 2
        } ]
    }), nomatch({
        "a.b": {
            $ne: 2
        }
    }, {
        a: [ {
            b: 1
        }, {
            b: 2
        } ]
    }), match({
        "a.b": {
            $ne: 3
        }
    }, {
        a: [ {
            b: 1
        }, {
            b: 2
        } ]
    }), nomatch({
        a: {
            $ne: {
                x: 1
            }
        }
    }, {
        a: {
            x: 1
        }
    }), match({
        a: {
            $ne: {
                x: 1
            }
        }
    }, {
        a: {
            x: 2
        }
    }), match({
        a: {
            $ne: {
                x: 1
            }
        }
    }, {
        a: {
            x: 1,
            y: 2
        }
    }), match({
        "a.b": {
            $ne: 5,
            $gt: 6
        }
    }, {
        a: [ {
            b: 2
        }, {
            b: 10
        } ]
    }), nomatch({
        "a.b": {
            $ne: 5,
            $gt: 6
        }
    }, {
        a: [ {
            b: 2
        }, {
            b: 4
        } ]
    }), nomatch({
        "a.b": {
            $ne: 5,
            $gt: 6
        }
    }, {
        a: [ {
            b: 2
        }, {
            b: 5
        } ]
    }), nomatch({
        "a.b": {
            $ne: 5,
            $gt: 6
        }
    }, {
        a: [ {
            b: 10
        }, {
            b: 5
        } ]
    }), match({
        a: {
            $ne: 5,
            $gt: 6
        }
    }, {
        a: [ 2, 10 ]
    }), nomatch({
        a: {
            $ne: 5,
            $gt: 6
        }
    }, {
        a: [ 2, 4 ]
    }), nomatch({
        a: {
            $ne: 5,
            $gt: 6
        }
    }, {
        a: [ 2, 5 ]
    }), nomatch({
        a: {
            $ne: 5,
            $gt: 6
        }
    }, {
        a: [ 10, 5 ]
    }), match({
        a: {
            $in: [ 1, 2, 3 ]
        }
    }, {
        a: 2
    }), nomatch({
        a: {
            $in: [ 1, 2, 3 ]
        }
    }, {
        a: 4
    }), match({
        a: {
            $in: [ [ 1 ], [ 2 ], [ 3 ] ]
        }
    }, {
        a: [ 2 ]
    }), nomatch({
        a: {
            $in: [ [ 1 ], [ 2 ], [ 3 ] ]
        }
    }, {
        a: [ 4 ]
    }), match({
        a: {
            $in: [ {
                b: 1
            }, {
                b: 2
            }, {
                b: 3
            } ]
        }
    }, {
        a: {
            b: 2
        }
    }), nomatch({
        a: {
            $in: [ {
                b: 1
            }, {
                b: 2
            }, {
                b: 3
            } ]
        }
    }, {
        a: {
            b: 4
        }
    }), match({
        a: {
            $in: [ 1, 2, 3 ]
        }
    }, {
        a: [ 2 ]
    }), match({
        a: {
            $in: [ {
                x: 1
            }, {
                x: 2
            }, {
                x: 3
            } ]
        }
    }, {
        a: [ {
            x: 2
        } ]
    }), match({
        a: {
            $in: [ 1, 2, 3 ]
        }
    }, {
        a: [ 4, 2 ]
    }), nomatch({
        a: {
            $in: [ 1, 2, 3 ]
        }
    }, {
        a: [ 4 ]
    }), match({
        a: {
            $in: [ "x", /foo/i ]
        }
    }, {
        a: "x"
    }), match({
        a: {
            $in: [ "x", /foo/i ]
        }
    }, {
        a: "fOo"
    }), match({
        a: {
            $in: [ "x", /foo/i ]
        }
    }, {
        a: [ "f", "fOo" ]
    }), nomatch({
        a: {
            $in: [ "x", /foo/i ]
        }
    }, {
        a: [ "f", "fOx" ]
    }), match({
        a: {
            $in: [ 1, null ]
        }
    }, {}), match({
        "a.b": {
            $in: [ 1, null ]
        }
    }, {}), match({
        "a.b": {
            $in: [ 1, null ]
        }
    }, {
        a: {}
    }), match({
        "a.b": {
            $in: [ 1, null ]
        }
    }, {
        a: {
            b: null
        }
    }), nomatch({
        "a.b": {
            $in: [ 1, null ]
        }
    }, {
        a: {
            b: 5
        }
    }), nomatch({
        "a.b": {
            $in: [ 1 ]
        }
    }, {
        a: {
            b: null
        }
    }), nomatch({
        "a.b": {
            $in: [ 1 ]
        }
    }, {
        a: {}
    }), nomatch({
        "a.b": {
            $in: [ 1, null ]
        }
    }, {
        a: [ {
            b: 5
        } ]
    }), match({
        "a.b": {
            $in: [ 1, null ]
        }
    }, {
        a: [ {
            b: 5
        }, {} ]
    }), nomatch({
        "a.b": {
            $in: [ 1, null ]
        }
    }, {
        a: [ {
            b: 5
        }, [] ]
    }), nomatch({
        "a.b": {
            $in: [ 1, null ]
        }
    }, {
        a: [ {
            b: 5
        }, 5 ]
    }), nomatch({
        a: {
            $nin: [ 1, 2, 3 ]
        }
    }, {
        a: 2
    }), match({
        a: {
            $nin: [ 1, 2, 3 ]
        }
    }, {
        a: 4
    }), nomatch({
        a: {
            $nin: [ [ 1 ], [ 2 ], [ 3 ] ]
        }
    }, {
        a: [ 2 ]
    }), match({
        a: {
            $nin: [ [ 1 ], [ 2 ], [ 3 ] ]
        }
    }, {
        a: [ 4 ]
    }), nomatch({
        a: {
            $nin: [ {
                b: 1
            }, {
                b: 2
            }, {
                b: 3
            } ]
        }
    }, {
        a: {
            b: 2
        }
    }), match({
        a: {
            $nin: [ {
                b: 1
            }, {
                b: 2
            }, {
                b: 3
            } ]
        }
    }, {
        a: {
            b: 4
        }
    }), nomatch({
        a: {
            $nin: [ 1, 2, 3 ]
        }
    }, {
        a: [ 2 ]
    }), nomatch({
        a: {
            $nin: [ {
                x: 1
            }, {
                x: 2
            }, {
                x: 3
            } ]
        }
    }, {
        a: [ {
            x: 2
        } ]
    }), nomatch({
        a: {
            $nin: [ 1, 2, 3 ]
        }
    }, {
        a: [ 4, 2 ]
    }), nomatch({
        "a.b": {
            $nin: [ 1, 2, 3 ]
        }
    }, {
        a: [ {
            b: 4
        }, {
            b: 2
        } ]
    }), match({
        a: {
            $nin: [ 1, 2, 3 ]
        }
    }, {
        a: [ 4 ]
    }), match({
        "a.b": {
            $nin: [ 1, 2, 3 ]
        }
    }, {
        a: [ {
            b: 4
        } ]
    }), nomatch({
        a: {
            $nin: [ "x", /foo/i ]
        }
    }, {
        a: "x"
    }), nomatch({
        a: {
            $nin: [ "x", /foo/i ]
        }
    }, {
        a: "fOo"
    }), nomatch({
        a: {
            $nin: [ "x", /foo/i ]
        }
    }, {
        a: [ "f", "fOo" ]
    }), match({
        a: {
            $nin: [ "x", /foo/i ]
        }
    }, {
        a: [ "f", "fOx" ]
    }), nomatch({
        a: {
            $nin: [ 1, null ]
        }
    }, {}), nomatch({
        "a.b": {
            $nin: [ 1, null ]
        }
    }, {}), nomatch({
        "a.b": {
            $nin: [ 1, null ]
        }
    }, {
        a: {}
    }), nomatch({
        "a.b": {
            $nin: [ 1, null ]
        }
    }, {
        a: {
            b: null
        }
    }), match({
        "a.b": {
            $nin: [ 1, null ]
        }
    }, {
        a: {
            b: 5
        }
    }), match({
        "a.b": {
            $nin: [ 1 ]
        }
    }, {
        a: {
            b: null
        }
    }), match({
        "a.b": {
            $nin: [ 1 ]
        }
    }, {
        a: {}
    }), match({
        "a.b": {
            $nin: [ 1, null ]
        }
    }, {
        a: [ {
            b: 5
        } ]
    }), nomatch({
        "a.b": {
            $nin: [ 1, null ]
        }
    }, {
        a: [ {
            b: 5
        }, {} ]
    }), match({
        "a.b": {
            $nin: [ 1, null ]
        }
    }, {
        a: [ {
            b: 5
        }, [] ]
    }), match({
        "a.b": {
            $nin: [ 1, null ]
        }
    }, {
        a: [ {
            b: 5
        }, 5 ]
    }), match({
        a: {
            $size: 0
        }
    }, {
        a: []
    }), match({
        a: {
            $size: 1
        }
    }, {
        a: [ 2 ]
    }), match({
        a: {
            $size: 2
        }
    }, {
        a: [ 2, 2 ]
    }), nomatch({
        a: {
            $size: 0
        }
    }, {
        a: [ 2 ]
    }), nomatch({
        a: {
            $size: 1
        }
    }, {
        a: []
    }), nomatch({
        a: {
            $size: 1
        }
    }, {
        a: [ 2, 2 ]
    }), nomatch({
        a: {
            $size: 0
        }
    }, {
        a: "2"
    }), nomatch({
        a: {
            $size: 1
        }
    }, {
        a: "2"
    }), nomatch({
        a: {
            $size: 2
        }
    }, {
        a: "2"
    }), nomatch({
        a: {
            $size: 2
        }
    }, {
        a: [ [ 2, 2 ] ]
    }), match({
        a: {
            $type: 1
        }
    }, {
        a: 1.1
    }), match({
        a: {
            $type: 1
        }
    }, {
        a: 1
    }), nomatch({
        a: {
            $type: 1
        }
    }, {
        a: "1"
    }), match({
        a: {
            $type: 2
        }
    }, {
        a: "1"
    }), nomatch({
        a: {
            $type: 2
        }
    }, {
        a: 1
    }), match({
        a: {
            $type: 3
        }
    }, {
        a: {}
    }), match({
        a: {
            $type: 3
        }
    }, {
        a: {
            b: 2
        }
    }), nomatch({
        a: {
            $type: 3
        }
    }, {
        a: []
    }), nomatch({
        a: {
            $type: 3
        }
    }, {
        a: [ 1 ]
    }), nomatch({
        a: {
            $type: 3
        }
    }, {
        a: null
    }), match({
        a: {
            $type: 5
        }
    }, {
        a: EJSON.newBinary(0)
    }), match({
        a: {
            $type: 5
        }
    }, {
        a: EJSON.newBinary(4)
    }), nomatch({
        a: {
            $type: 5
        }
    }, {
        a: []
    }), nomatch({
        a: {
            $type: 5
        }
    }, {
        a: [ 42 ]
    }), match({
        a: {
            $type: 7
        }
    }, {
        a: new LocalCollection._ObjectID()
    }), nomatch({
        a: {
            $type: 7
        }
    }, {
        a: "1234567890abcd1234567890"
    }), match({
        a: {
            $type: 8
        }
    }, {
        a: !0
    }), match({
        a: {
            $type: 8
        }
    }, {
        a: !1
    }), nomatch({
        a: {
            $type: 8
        }
    }, {
        a: "true"
    }), nomatch({
        a: {
            $type: 8
        }
    }, {
        a: 0
    }), nomatch({
        a: {
            $type: 8
        }
    }, {
        a: null
    }), nomatch({
        a: {
            $type: 8
        }
    }, {
        a: ""
    }), nomatch({
        a: {
            $type: 8
        }
    }, {}), match({
        a: {
            $type: 9
        }
    }, {
        a: new Date()
    }), nomatch({
        a: {
            $type: 9
        }
    }, {
        a: +new Date()
    }), match({
        a: {
            $type: 10
        }
    }, {
        a: null
    }), nomatch({
        a: {
            $type: 10
        }
    }, {
        a: !1
    }), nomatch({
        a: {
            $type: 10
        }
    }, {
        a: ""
    }), nomatch({
        a: {
            $type: 10
        }
    }, {
        a: 0
    }), nomatch({
        a: {
            $type: 10
        }
    }, {}), match({
        a: {
            $type: 11
        }
    }, {
        a: /x/
    }), nomatch({
        a: {
            $type: 11
        }
    }, {
        a: "x"
    }), nomatch({
        a: {
            $type: 11
        }
    }, {}), nomatch({
        a: {
            $type: 4
        }
    }, {
        a: []
    }), nomatch({
        a: {
            $type: 4
        }
    }, {
        a: [ 1 ]
    }), match({
        a: {
            $type: 1
        }
    }, {
        a: [ 1 ]
    }), nomatch({
        a: {
            $type: 2
        }
    }, {
        a: [ 1 ]
    }), match({
        a: {
            $type: 1
        }
    }, {
        a: [ "1", 1 ]
    }), match({
        a: {
            $type: 2
        }
    }, {
        a: [ "1", 1 ]
    }), nomatch({
        a: {
            $type: 3
        }
    }, {
        a: [ "1", 1 ]
    }), nomatch({
        a: {
            $type: 4
        }
    }, {
        a: [ "1", 1 ]
    }), nomatch({
        a: {
            $type: 1
        }
    }, {
        a: [ "1", [] ]
    }), match({
        a: {
            $type: 2
        }
    }, {
        a: [ "1", [] ]
    }), match({
        a: {
            $type: 4
        }
    }, {
        a: [ "1", [] ]
    }), match({
        "a.0": {
            $type: 4
        }
    }, {
        a: [ [ 0 ] ]
    }), nomatch({
        "a.0": {
            $type: 1
        }
    }, {
        a: [ [ 0 ] ]
    }), match({
        a: /a/
    }, {
        a: "cat"
    }), nomatch({
        a: /a/
    }, {
        a: "cut"
    }), nomatch({
        a: /a/
    }, {
        a: "CAT"
    }), match({
        a: /a/i
    }, {
        a: "CAT"
    }), match({
        a: /a/
    }, {
        a: [ "foo", "bar" ]
    }), nomatch({
        a: /,/
    }, {
        a: [ "foo", "bar" ]
    }), match({
        a: {
            $regex: "a"
        }
    }, {
        a: [ "foo", "bar" ]
    }), nomatch({
        a: {
            $regex: ","
        }
    }, {
        a: [ "foo", "bar" ]
    }), match({
        a: {
            $regex: /a/
        }
    }, {
        a: "cat"
    }), nomatch({
        a: {
            $regex: /a/
        }
    }, {
        a: "cut"
    }), nomatch({
        a: {
            $regex: /a/
        }
    }, {
        a: "CAT"
    }), match({
        a: {
            $regex: /a/i
        }
    }, {
        a: "CAT"
    }), match({
        a: {
            $regex: /a/,
            $options: "i"
        }
    }, {
        a: "CAT"
    }), match({
        a: {
            $regex: /a/i,
            $options: "i"
        }
    }, {
        a: "CAT"
    }), nomatch({
        a: {
            $regex: /a/i,
            $options: ""
        }
    }, {
        a: "CAT"
    }), match({
        a: {
            $regex: "a"
        }
    }, {
        a: "cat"
    }), nomatch({
        a: {
            $regex: "a"
        }
    }, {
        a: "cut"
    }), nomatch({
        a: {
            $regex: "a"
        }
    }, {
        a: "CAT"
    }), match({
        a: {
            $regex: "a",
            $options: "i"
        }
    }, {
        a: "CAT"
    }), match({
        a: {
            $regex: "",
            $options: "i"
        }
    }, {
        a: "foo"
    }), nomatch({
        a: {
            $regex: "",
            $options: "i"
        }
    }, {}), nomatch({
        a: {
            $regex: "",
            $options: "i"
        }
    }, {
        a: 5
    }), nomatch({
        a: /undefined/
    }, {}), nomatch({
        a: {
            $regex: "undefined"
        }
    }, {}), nomatch({
        a: /xxx/
    }, {}), nomatch({
        a: {
            $regex: "xxx"
        }
    }, {});
    var reusedRegexp = /sh/gi;
    match({
        a: reusedRegexp
    }, {
        a: "Shorts"
    }), match({
        a: reusedRegexp
    }, {
        a: "Shorts"
    }), match({
        a: reusedRegexp
    }, {
        a: "Shorts"
    }), match({
        a: {
            $regex: reusedRegexp
        }
    }, {
        a: "Shorts"
    }), match({
        a: {
            $regex: reusedRegexp
        }
    }, {
        a: "Shorts"
    }), match({
        a: {
            $regex: reusedRegexp
        }
    }, {
        a: "Shorts"
    }), test["throws"](function() {
        match({
            a: {
                $options: "i"
            }
        }, {
            a: 12
        });
    }), match({
        a: /a/
    }, {
        a: [ "dog", "cat" ]
    }), nomatch({
        a: /a/
    }, {
        a: [ "dog", "puppy" ]
    }), match({
        a: /a/
    }, {
        a: /a/
    }), match({
        a: /a/
    }, {
        a: [ "x", /a/ ]
    }), nomatch({
        a: /a/
    }, {
        a: /a/i
    }), nomatch({
        a: /a/m
    }, {
        a: /a/
    }), nomatch({
        a: /a/
    }, {
        a: /b/
    }), nomatch({
        a: /5/
    }, {
        a: 5
    }), nomatch({
        a: /t/
    }, {
        a: !0
    }), match({
        a: /m/i
    }, {
        a: [ "x", "xM" ]
    }), test["throws"](function() {
        match({
            a: {
                $regex: /a/,
                $options: "x"
            }
        }, {
            a: "cat"
        });
    }), test["throws"](function() {
        match({
            a: {
                $regex: /a/,
                $options: "s"
            }
        }, {
            a: "cat"
        });
    }), match({
        x: {
            $not: {
                $gt: 7
            }
        }
    }, {
        x: 6
    }), nomatch({
        x: {
            $not: {
                $gt: 7
            }
        }
    }, {
        x: 8
    }), match({
        x: {
            $not: {
                $lt: 10,
                $gt: 7
            }
        }
    }, {
        x: 11
    }), nomatch({
        x: {
            $not: {
                $lt: 10,
                $gt: 7
            }
        }
    }, {
        x: 9
    }), match({
        x: {
            $not: {
                $lt: 10,
                $gt: 7
            }
        }
    }, {
        x: 6
    }), match({
        x: {
            $not: {
                $gt: 7
            }
        }
    }, {
        x: [ 2, 3, 4 ]
    }), match({
        "x.y": {
            $not: {
                $gt: 7
            }
        }
    }, {
        x: [ {
            y: 2
        }, {
            y: 3
        }, {
            y: 4
        } ]
    }), nomatch({
        x: {
            $not: {
                $gt: 7
            }
        }
    }, {
        x: [ 2, 3, 4, 10 ]
    }), nomatch({
        "x.y": {
            $not: {
                $gt: 7
            }
        }
    }, {
        x: [ {
            y: 2
        }, {
            y: 3
        }, {
            y: 4
        }, {
            y: 10
        } ]
    }), match({
        x: {
            $not: /a/
        }
    }, {
        x: "dog"
    }), nomatch({
        x: {
            $not: /a/
        }
    }, {
        x: "cat"
    }), match({
        x: {
            $not: /a/
        }
    }, {
        x: [ "dog", "puppy" ]
    }), nomatch({
        x: {
            $not: /a/
        }
    }, {
        x: [ "kitten", "cat" ]
    }), match({
        "a.b": 1
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        "a.b": 1
    }, {
        a: {
            b: 2
        }
    }), match({
        "a.b": [ 1, 2, 3 ]
    }, {
        a: {
            b: [ 1, 2, 3 ]
        }
    }), nomatch({
        "a.b": [ 1, 2, 3 ]
    }, {
        a: {
            b: [ 4 ]
        }
    }), match({
        "a.b": /a/
    }, {
        a: {
            b: "cat"
        }
    }), nomatch({
        "a.b": /a/
    }, {
        a: {
            b: "dog"
        }
    }), match({
        "a.b.c": null
    }, {}), match({
        "a.b.c": null
    }, {
        a: 1
    }), match({
        "a.b": null
    }, {
        a: 1
    }), match({
        "a.b.c": null
    }, {
        a: {
            b: 4
        }
    }), nomatch({
        "a.b": null
    }, {
        a: [ 1 ]
    }), match({
        "a.b": []
    }, {
        a: {
            b: []
        }
    });
    var big = {
        a: [ {
            b: 1
        }, 2, {}, {
            b: [ 3, 4 ]
        } ]
    };
    match({
        "a.b": 1
    }, big), match({
        "a.b": [ 3, 4 ]
    }, big), match({
        "a.b": 3
    }, big), match({
        "a.b": 4
    }, big), match({
        "a.b": null
    }, big), match({
        "a.1": 8
    }, {
        a: [ 7, 8, 9 ]
    }), nomatch({
        "a.1": 7
    }, {
        a: [ 7, 8, 9 ]
    }), nomatch({
        "a.1": null
    }, {
        a: [ 7, 8, 9 ]
    }), match({
        "a.1": [ 8, 9 ]
    }, {
        a: [ 7, [ 8, 9 ] ]
    }), nomatch({
        "a.1": 6
    }, {
        a: [ [ 6, 7 ], [ 8, 9 ] ]
    }), nomatch({
        "a.1": 7
    }, {
        a: [ [ 6, 7 ], [ 8, 9 ] ]
    }), nomatch({
        "a.1": 8
    }, {
        a: [ [ 6, 7 ], [ 8, 9 ] ]
    }), nomatch({
        "a.1": 9
    }, {
        a: [ [ 6, 7 ], [ 8, 9 ] ]
    }), match({
        "a.1": 2
    }, {
        a: [ 0, {
            1: 2
        }, 3 ]
    }), match({
        "a.1": {
            1: 2
        }
    }, {
        a: [ 0, {
            1: 2
        }, 3 ]
    }), match({
        "x.1.y": 8
    }, {
        x: [ 7, {
            y: 8
        }, 9 ]
    }), match({
        "x.1.y": null
    }, {
        x: [ 7, {
            y: 8
        }, 9 ]
    }), match({
        "a.1.b": 9
    }, {
        a: [ 7, {
            b: 9
        }, {
            1: {
                b: "foo"
            }
        } ]
    }), match({
        "a.1.b": "foo"
    }, {
        a: [ 7, {
            b: 9
        }, {
            1: {
                b: "foo"
            }
        } ]
    }), match({
        "a.1.b": null
    }, {
        a: [ 7, {
            b: 9
        }, {
            1: {
                b: "foo"
            }
        } ]
    }), match({
        "a.1.b": 2
    }, {
        a: [ 1, [ {
            b: 2
        } ], 3 ]
    }), nomatch({
        "a.1.b": null
    }, {
        a: [ 1, [ {
            b: 2
        } ], 3 ]
    }), nomatch({
        "a.0.b": null
    }, {
        a: [ 5 ]
    }), match({
        "a.1": 4
    }, {
        a: [ {
            1: 4
        }, 5 ]
    }), match({
        "a.1": 5
    }, {
        a: [ {
            1: 4
        }, 5 ]
    }), nomatch({
        "a.1": null
    }, {
        a: [ {
            1: 4
        }, 5 ]
    }), match({
        "a.1.foo": 4
    }, {
        a: [ {
            1: {
                foo: 4
            }
        }, {
            foo: 5
        } ]
    }), match({
        "a.1.foo": 5
    }, {
        a: [ {
            1: {
                foo: 4
            }
        }, {
            foo: 5
        } ]
    }), match({
        "a.1.foo": null
    }, {
        a: [ {
            1: {
                foo: 4
            }
        }, {
            foo: 5
        } ]
    }), nomatch({
        "a.b": 1
    }, {
        x: 2
    }), nomatch({
        "a.b.c": 1
    }, {
        a: {
            x: 2
        }
    }), nomatch({
        "a.b.c": 1
    }, {
        a: {
            b: {
                x: 2
            }
        }
    }), nomatch({
        "a.b.c": 1
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        "a.b.c": 1
    }, {
        a: {
            b: 0
        }
    }), match({
        "a.b": {
            c: 1
        }
    }, {
        a: {
            b: {
                c: 1
            }
        }
    }), nomatch({
        "a.b": {
            c: 1
        }
    }, {
        a: {
            b: {
                c: 2
            }
        }
    }), nomatch({
        "a.b": {
            c: 1
        }
    }, {
        a: {
            b: 2
        }
    }), match({
        "a.b": {
            c: 1,
            d: 2
        }
    }, {
        a: {
            b: {
                c: 1,
                d: 2
            }
        }
    }), nomatch({
        "a.b": {
            c: 1,
            d: 2
        }
    }, {
        a: {
            b: {
                c: 1,
                d: 1
            }
        }
    }), nomatch({
        "a.b": {
            c: 1,
            d: 2
        }
    }, {
        a: {
            b: {
                d: 2
            }
        }
    }), match({
        "a.b": {
            $in: [ 1, 2, 3 ]
        }
    }, {
        a: {
            b: [ 2 ]
        }
    }), match({
        "a.b": {
            $in: [ {
                x: 1
            }, {
                x: 2
            }, {
                x: 3
            } ]
        }
    }, {
        a: {
            b: [ {
                x: 2
            } ]
        }
    }), match({
        "a.b": {
            $in: [ 1, 2, 3 ]
        }
    }, {
        a: {
            b: [ 4, 2 ]
        }
    }), nomatch({
        "a.b": {
            $in: [ 1, 2, 3 ]
        }
    }, {
        a: {
            b: [ 4 ]
        }
    }), test["throws"](function() {
        match({
            $or: []
        }, {});
    }), test["throws"](function() {
        match({
            $or: [ 5 ]
        }, {});
    }), test["throws"](function() {
        match({
            $or: []
        }, {
            a: 1
        });
    }), match({
        $or: [ {
            a: 1
        } ]
    }, {
        a: 1
    }), nomatch({
        $or: [ {
            b: 2
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $or: [ {
            c: 3
        }, {
            d: 4
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        a: [ 1, 2, 3 ]
    }), nomatch({
        $or: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        c: [ 1, 2, 3 ]
    }), nomatch({
        $or: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        a: [ 2, 3, 4 ]
    }), match({
        $or: [ {
            a: 1
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: 1
        }, {
            a: 2
        } ],
        b: 2
    }, {
        a: 1,
        b: 2
    }), nomatch({
        $or: [ {
            a: 2
        }, {
            a: 3
        } ],
        b: 2
    }, {
        a: 1,
        b: 2
    }), nomatch({
        $or: [ {
            a: 1
        }, {
            a: 2
        } ],
        b: 3
    }, {
        a: 1,
        b: 2
    }), match({
        x: 1,
        $or: [ {
            a: 1
        }, {
            b: 1
        } ]
    }, {
        x: 1,
        b: 1
    }), match({
        $or: [ {
            a: 1
        }, {
            b: 1
        } ],
        x: 1
    }, {
        x: 1,
        b: 1
    }), nomatch({
        x: 1,
        $or: [ {
            a: 1
        }, {
            b: 1
        } ]
    }, {
        b: 1
    }), nomatch({
        x: 1,
        $or: [ {
            a: 1
        }, {
            b: 1
        } ]
    }, {
        x: 1
    }), match({
        $or: [ {
            a: {
                $lte: 1
            }
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $or: [ {
            a: {
                $lt: 1
            }
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $gte: 1
            }
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $or: [ {
            a: {
                $gt: 1
            }
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            b: {
                $gt: 1
            }
        }, {
            b: {
                $lt: 3
            }
        } ]
    }, {
        b: 2
    }), nomatch({
        $or: [ {
            b: {
                $lt: 1
            }
        }, {
            b: {
                $gt: 3
            }
        } ]
    }, {
        b: 2
    }), match({
        $or: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $or: [ {
            a: {
                $in: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        b: 2
    }), nomatch({
        $or: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        c: 3
    }), match({
        $or: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $in: [ 1, 2, 3 ]
            }
        } ]
    }, {
        b: 2
    }), nomatch({
        $or: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $in: [ 4, 5, 6 ]
            }
        } ]
    }, {
        b: 2
    }), nomatch({
        $or: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $nin: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $or: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        b: 2
    }), match({
        $or: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        c: 3
    }), match({
        $or: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $nin: [ 1, 2, 3 ]
            }
        } ]
    }, {
        b: 2
    }), nomatch({
        $or: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $nin: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1,
        b: 2
    }), match({
        $or: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $nin: [ 4, 5, 6 ]
            }
        } ]
    }, {
        b: 2
    }), match({
        $or: [ {
            "a.b": 1
        }, {
            "a.b": 2
        } ]
    }, {
        a: {
            b: 1
        }
    }), match({
        $or: [ {
            "a.b": 1
        }, {
            "a.c": 1
        } ]
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        $or: [ {
            "a.b": 2
        }, {
            "a.c": 1
        } ]
    }, {
        a: {
            b: 1
        }
    }), match({
        $or: [ {
            a: {
                b: 1,
                c: 2
            }
        }, {
            a: {
                b: 2,
                c: 1
            }
        } ]
    }, {
        a: {
            b: 1,
            c: 2
        }
    }), nomatch({
        $or: [ {
            a: {
                b: 1,
                c: 3
            }
        }, {
            a: {
                b: 2,
                c: 1
            }
        } ]
    }, {
        a: {
            b: 1,
            c: 2
        }
    }), match({
        $or: [ {
            a: /a/
        } ]
    }, {
        a: "cat"
    }), nomatch({
        $or: [ {
            a: /o/
        } ]
    }, {
        a: "cat"
    }), match({
        $or: [ {
            a: /a/
        }, {
            a: /o/
        } ]
    }, {
        a: "cat"
    }), nomatch({
        $or: [ {
            a: /i/
        }, {
            a: /o/
        } ]
    }, {
        a: "cat"
    }), match({
        $or: [ {
            a: /i/
        }, {
            b: /o/
        } ]
    }, {
        a: "cat",
        b: "dog"
    }), match({
        $or: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {}), nomatch({
        $or: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {
        a: 2
    }), match({
        $or: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {
        b: 1
    }), match({
        $or: [ {
            a: {
                $ne: 1
            }
        }, {
            a: {
                $ne: 2
            }
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $ne: 1
            }
        }, {
            b: {
                $ne: 1
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $or: [ {
            a: {
                $ne: 1
            }
        }, {
            b: {
                $ne: 2
            }
        } ]
    }, {
        a: 1,
        b: 2
    }), match({
        $or: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        } ]
    }, {}), nomatch({
        $or: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        } ]
    }, {
        a: 2
    }), match({
        $or: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        }, {
            a: {
                $not: {
                    $mod: [ 10, 2 ]
                }
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $or: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        }, {
            a: {
                $mod: [ 10, 2 ]
            }
        } ]
    }, {
        a: 1
    }), match({
        $or: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        }, {
            a: {
                $mod: [ 10, 2 ]
            }
        } ]
    }, {
        a: 2
    }), match({
        $or: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        }, {
            a: {
                $mod: [ 10, 2 ]
            }
        } ]
    }, {
        a: 3
    }), test["throws"](function() {
        match({
            $nor: []
        }, {});
    }), test["throws"](function() {
        match({
            $nor: [ 5 ]
        }, {});
    }), test["throws"](function() {
        match({
            $nor: []
        }, {
            a: 1
        });
    }), nomatch({
        $nor: [ {
            a: 1
        } ]
    }, {
        a: 1
    }), match({
        $nor: [ {
            b: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        a: 1
    }), match({
        $nor: [ {
            c: 3
        }, {
            d: 4
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        a: [ 1, 2, 3 ]
    }), match({
        $nor: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        c: [ 1, 2, 3 ]
    }), match({
        $nor: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        a: [ 2, 3, 4 ]
    }), nomatch({
        $nor: [ {
            a: 1
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $lte: 1
            }
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), match({
        $nor: [ {
            a: {
                $lt: 1
            }
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $gte: 1
            }
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), match({
        $nor: [ {
            a: {
                $gt: 1
            }
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            b: {
                $gt: 1
            }
        }, {
            b: {
                $lt: 3
            }
        } ]
    }, {
        b: 2
    }), match({
        $nor: [ {
            b: {
                $lt: 1
            }
        }, {
            b: {
                $gt: 3
            }
        } ]
    }, {
        b: 2
    }), nomatch({
        $nor: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1
    }), match({
        $nor: [ {
            a: {
                $in: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        b: 2
    }), match({
        $nor: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        c: 3
    }), nomatch({
        $nor: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $in: [ 1, 2, 3 ]
            }
        } ]
    }, {
        b: 2
    }), match({
        $nor: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $in: [ 4, 5, 6 ]
            }
        } ]
    }, {
        b: 2
    }), match({
        $nor: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $nin: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1
    }), match({
        $nor: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        b: 2
    }), nomatch({
        $nor: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: 2
        } ]
    }, {
        c: 3
    }), nomatch({
        $nor: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $nin: [ 1, 2, 3 ]
            }
        } ]
    }, {
        b: 2
    }), match({
        $nor: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $nin: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1,
        b: 2
    }), nomatch({
        $nor: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $nin: [ 4, 5, 6 ]
            }
        } ]
    }, {
        b: 2
    }), nomatch({
        $nor: [ {
            "a.b": 1
        }, {
            "a.b": 2
        } ]
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        $nor: [ {
            "a.b": 1
        }, {
            "a.c": 1
        } ]
    }, {
        a: {
            b: 1
        }
    }), match({
        $nor: [ {
            "a.b": 2
        }, {
            "a.c": 1
        } ]
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        $nor: [ {
            a: {
                b: 1,
                c: 2
            }
        }, {
            a: {
                b: 2,
                c: 1
            }
        } ]
    }, {
        a: {
            b: 1,
            c: 2
        }
    }), match({
        $nor: [ {
            a: {
                b: 1,
                c: 3
            }
        }, {
            a: {
                b: 2,
                c: 1
            }
        } ]
    }, {
        a: {
            b: 1,
            c: 2
        }
    }), nomatch({
        $nor: [ {
            a: /a/
        } ]
    }, {
        a: "cat"
    }), match({
        $nor: [ {
            a: /o/
        } ]
    }, {
        a: "cat"
    }), nomatch({
        $nor: [ {
            a: /a/
        }, {
            a: /o/
        } ]
    }, {
        a: "cat"
    }), match({
        $nor: [ {
            a: /i/
        }, {
            a: /o/
        } ]
    }, {
        a: "cat"
    }), nomatch({
        $nor: [ {
            a: /i/
        }, {
            b: /o/
        } ]
    }, {
        a: "cat",
        b: "dog"
    }), nomatch({
        $nor: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {}), match({
        $nor: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {
        a: 2
    }), nomatch({
        $nor: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {
        b: 1
    }), nomatch({
        $nor: [ {
            a: {
                $ne: 1
            }
        }, {
            a: {
                $ne: 2
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $ne: 1
            }
        }, {
            b: {
                $ne: 1
            }
        } ]
    }, {
        a: 1
    }), match({
        $nor: [ {
            a: {
                $ne: 1
            }
        }, {
            b: {
                $ne: 2
            }
        } ]
    }, {
        a: 1,
        b: 2
    }), nomatch({
        $nor: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        } ]
    }, {}), match({
        $nor: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        } ]
    }, {
        a: 2
    }), nomatch({
        $nor: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        }, {
            a: {
                $not: {
                    $mod: [ 10, 2 ]
                }
            }
        } ]
    }, {
        a: 1
    }), match({
        $nor: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        }, {
            a: {
                $mod: [ 10, 2 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $nor: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        }, {
            a: {
                $mod: [ 10, 2 ]
            }
        } ]
    }, {
        a: 2
    }), nomatch({
        $nor: [ {
            a: {
                $not: {
                    $mod: [ 10, 1 ]
                }
            }
        }, {
            a: {
                $mod: [ 10, 2 ]
            }
        } ]
    }, {
        a: 3
    }), test["throws"](function() {
        match({
            $and: []
        }, {});
    }), test["throws"](function() {
        match({
            $and: [ 5 ]
        }, {});
    }), test["throws"](function() {
        match({
            $and: []
        }, {
            a: 1
        });
    }), match({
        $and: [ {
            a: 1
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: 1
        }, {
            a: 2
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: 1
        }, {
            b: 1
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: 1
        }, {
            b: 2
        } ]
    }, {
        a: 1,
        b: 2
    }), nomatch({
        $and: [ {
            a: 1
        }, {
            b: 1
        } ]
    }, {
        a: 1,
        b: 2
    }), match({
        $and: [ {
            a: 1
        }, {
            b: 2
        } ],
        c: 3
    }, {
        a: 1,
        b: 2,
        c: 3
    }), nomatch({
        $and: [ {
            a: 1
        }, {
            b: 2
        } ],
        c: 4
    }, {
        a: 1,
        b: 2,
        c: 3
    }), match({
        $and: [ {
            a: /a/
        } ]
    }, {
        a: "cat"
    }), match({
        $and: [ {
            a: /a/i
        } ]
    }, {
        a: "CAT"
    }), nomatch({
        $and: [ {
            a: /o/
        } ]
    }, {
        a: "cat"
    }), nomatch({
        $and: [ {
            a: /a/
        }, {
            a: /o/
        } ]
    }, {
        a: "cat"
    }), match({
        $and: [ {
            a: /a/
        }, {
            b: /o/
        } ]
    }, {
        a: "cat",
        b: "dog"
    }), nomatch({
        $and: [ {
            a: /a/
        }, {
            b: /a/
        } ]
    }, {
        a: "cat",
        b: "dog"
    }), match({
        $and: [ {
            "a.b": 1
        } ]
    }, {
        a: {
            b: 1
        }
    }), match({
        $and: [ {
            a: {
                b: 1
            }
        } ]
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        $and: [ {
            "a.b": 2
        } ]
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        $and: [ {
            "a.c": 1
        } ]
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        $and: [ {
            "a.b": 1
        }, {
            "a.b": 2
        } ]
    }, {
        a: {
            b: 1
        }
    }), nomatch({
        $and: [ {
            "a.b": 1
        }, {
            a: {
                b: 2
            }
        } ]
    }, {
        a: {
            b: 1
        }
    }), match({
        $and: [ {
            "a.b": 1
        }, {
            "c.d": 2
        } ]
    }, {
        a: {
            b: 1
        },
        c: {
            d: 2
        }
    }), nomatch({
        $and: [ {
            "a.b": 1
        }, {
            "c.d": 1
        } ]
    }, {
        a: {
            b: 1
        },
        c: {
            d: 2
        }
    }), match({
        $and: [ {
            "a.b": 1
        }, {
            c: {
                d: 2
            }
        } ]
    }, {
        a: {
            b: 1
        },
        c: {
            d: 2
        }
    }), nomatch({
        $and: [ {
            "a.b": 1
        }, {
            c: {
                d: 1
            }
        } ]
    }, {
        a: {
            b: 1
        },
        c: {
            d: 2
        }
    }), nomatch({
        $and: [ {
            "a.b": 2
        }, {
            c: {
                d: 2
            }
        } ]
    }, {
        a: {
            b: 1
        },
        c: {
            d: 2
        }
    }), match({
        $and: [ {
            a: {
                b: 1
            }
        }, {
            c: {
                d: 2
            }
        } ]
    }, {
        a: {
            b: 1
        },
        c: {
            d: 2
        }
    }), nomatch({
        $and: [ {
            a: {
                b: 2
            }
        }, {
            c: {
                d: 2
            }
        } ]
    }, {
        a: {
            b: 1
        },
        c: {
            d: 2
        }
    }), nomatch({
        $and: [ {
            a: {
                $in: []
            }
        } ]
    }, {}), match({
        $and: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $in: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            a: {
                $in: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $in: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1,
        b: 4
    }), match({
        $and: [ {
            a: {
                $in: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $in: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1,
        b: 4
    }), match({
        $and: [ {
            a: {
                $nin: []
            }
        } ]
    }, {}), nomatch({
        $and: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $nin: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            a: {
                $nin: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $nin: [ 1, 2, 3 ]
            }
        } ]
    }, {
        a: 1,
        b: 4
    }), nomatch({
        $and: [ {
            a: {
                $nin: [ 1, 2, 3 ]
            }
        }, {
            b: {
                $nin: [ 4, 5, 6 ]
            }
        } ]
    }, {
        a: 1,
        b: 4
    }), match({
        $and: [ {
            a: {
                $lt: 2
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $lt: 1
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $lte: 1
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $gt: 0
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $gt: 1
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $gte: 1
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $gt: 0
            }
        }, {
            a: {
                $lt: 2
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $gt: 1
            }
        }, {
            a: {
                $lt: 2
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $gt: 0
            }
        }, {
            a: {
                $lt: 1
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $gte: 1
            }
        }, {
            a: {
                $lte: 1
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $gte: 2
            }
        }, {
            a: {
                $lte: 0
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {}), nomatch({
        $and: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $ne: 1
            }
        } ]
    }, {
        a: 2
    }), nomatch({
        $and: [ {
            a: {
                $ne: 1
            }
        }, {
            a: {
                $ne: 2
            }
        } ]
    }, {
        a: 2
    }), match({
        $and: [ {
            a: {
                $ne: 1
            }
        }, {
            a: {
                $ne: 3
            }
        } ]
    }, {
        a: 2
    }), match({
        $and: [ {
            a: {
                $not: {
                    $gt: 2
                }
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $not: {
                    $lt: 2
                }
            }
        } ]
    }, {
        a: 1
    }), match({
        $and: [ {
            a: {
                $not: {
                    $lt: 0
                }
            }
        }, {
            a: {
                $not: {
                    $gt: 2
                }
            }
        } ]
    }, {
        a: 1
    }), nomatch({
        $and: [ {
            a: {
                $not: {
                    $lt: 2
                }
            }
        }, {
            a: {
                $not: {
                    $gt: 0
                }
            }
        } ]
    }, {
        a: 1
    }), match({
        $where: "this.a === 1"
    }, {
        a: 1
    }), match({
        $where: "obj.a === 1"
    }, {
        a: 1
    }), nomatch({
        $where: "this.a !== 1"
    }, {
        a: 1
    }), nomatch({
        $where: "obj.a !== 1"
    }, {
        a: 1
    }), nomatch({
        $where: "this.a === 1",
        a: 2
    }, {
        a: 1
    }), match({
        $where: "this.a === 1",
        b: 2
    }, {
        a: 1,
        b: 2
    }), match({
        $where: "this.a === 1 && this.b === 2"
    }, {
        a: 1,
        b: 2
    }), match({
        $where: "this.a instanceof Array"
    }, {
        a: []
    }), nomatch({
        $where: "this.a instanceof Array"
    }, {
        a: 1
    }), match({
        "dogs.0.name": "Fido"
    }, {
        dogs: [ {
            name: "Fido"
        }, {
            name: "Rex"
        } ]
    }), match({
        "dogs.1.name": "Rex"
    }, {
        dogs: [ {
            name: "Fido"
        }, {
            name: "Rex"
        } ]
    }), nomatch({
        "dogs.1.name": "Fido"
    }, {
        dogs: [ {
            name: "Fido"
        }, {
            name: "Rex"
        } ]
    }), match({
        "room.1b": "bla"
    }, {
        room: {
            "1b": "bla"
        }
    }), match({
        "dogs.name": "Fido"
    }, {
        dogs: [ {
            name: "Fido"
        }, {
            name: "Rex"
        } ]
    }), match({
        "dogs.name": "Rex"
    }, {
        dogs: [ {
            name: "Fido"
        }, {
            name: "Rex"
        } ]
    }), match({
        "animals.dogs.name": "Fido"
    }, {
        animals: [ {
            dogs: [ {
                name: "Rover"
            } ]
        }, {}, {
            dogs: [ {
                name: "Fido"
            }, {
                name: "Rex"
            } ]
        } ]
    }), match({
        "animals.dogs.name": "Fido"
    }, {
        animals: [ {
            dogs: {
                name: "Rex"
            }
        }, {
            dogs: {
                name: "Fido"
            }
        } ]
    }), match({
        "animals.dogs.name": "Fido"
    }, {
        animals: [ {
            dogs: [ {
                name: "Rover"
            } ]
        }, {}, {
            dogs: [ {
                name: [ "Fido" ]
            }, {
                name: "Rex"
            } ]
        } ]
    }), nomatch({
        "dogs.name": "Fido"
    }, {
        dogs: []
    }), match({
        dogs: {
            $elemMatch: {
                name: /e/
            }
        }
    }, {
        dogs: [ {
            name: "Fido"
        }, {
            name: "Rex"
        } ]
    }), nomatch({
        dogs: {
            $elemMatch: {
                name: /a/
            }
        }
    }, {
        dogs: [ {
            name: "Fido"
        }, {
            name: "Rex"
        } ]
    }), match({
        dogs: {
            $elemMatch: {
                age: {
                    $gt: 4
                }
            }
        }
    }, {
        dogs: [ {
            name: "Fido",
            age: 5
        }, {
            name: "Rex",
            age: 3
        } ]
    }), match({
        dogs: {
            $elemMatch: {
                name: "Fido",
                age: {
                    $gt: 4
                }
            }
        }
    }, {
        dogs: [ {
            name: "Fido",
            age: 5
        }, {
            name: "Rex",
            age: 3
        } ]
    }), nomatch({
        dogs: {
            $elemMatch: {
                name: "Fido",
                age: {
                    $gt: 5
                }
            }
        }
    }, {
        dogs: [ {
            name: "Fido",
            age: 5
        }, {
            name: "Rex",
            age: 3
        } ]
    }), match({
        dogs: {
            $elemMatch: {
                name: /i/,
                age: {
                    $gt: 4
                }
            }
        }
    }, {
        dogs: [ {
            name: "Fido",
            age: 5
        }, {
            name: "Rex",
            age: 3
        } ]
    }), nomatch({
        dogs: {
            $elemMatch: {
                name: /e/,
                age: 5
            }
        }
    }, {
        dogs: [ {
            name: "Fido",
            age: 5
        }, {
            name: "Rex",
            age: 3
        } ]
    }), match({
        x: {
            $elemMatch: {
                y: 9
            }
        }
    }, {
        x: [ {
            y: 9
        } ]
    }), nomatch({
        x: {
            $elemMatch: {
                y: 9
            }
        }
    }, {
        x: [ [ {
            y: 9
        } ] ]
    }), match({
        x: {
            $elemMatch: {
                $gt: 5,
                $lt: 9
            }
        }
    }, {
        x: [ 8 ]
    }), nomatch({
        x: {
            $elemMatch: {
                $gt: 5,
                $lt: 9
            }
        }
    }, {
        x: [ [ 8 ] ]
    }), match({
        "a.x": {
            $elemMatch: {
                y: 9
            }
        }
    }, {
        a: [ {
            x: []
        }, {
            x: [ {
                y: 9
            } ]
        } ]
    }), nomatch({
        a: {
            $elemMatch: {
                x: 5
            }
        }
    }, {
        a: {
            x: 5
        }
    }), match({
        a: {
            $elemMatch: {
                0: {
                    $gt: 5,
                    $lt: 9
                }
            }
        }
    }, {
        a: [ [ 6 ] ]
    }), match({
        a: {
            $elemMatch: {
                "0.b": {
                    $gt: 5,
                    $lt: 9
                }
            }
        }
    }, {
        a: [ [ {
            b: 6
        } ] ]
    }), match({
        a: {
            $elemMatch: {
                x: 1,
                $or: [ {
                    a: 1
                }, {
                    b: 1
                } ]
            }
        }
    }, {
        a: [ {
            x: 1,
            b: 1
        } ]
    }), match({
        a: {
            $elemMatch: {
                $or: [ {
                    a: 1
                }, {
                    b: 1
                } ],
                x: 1
            }
        }
    }, {
        a: [ {
            x: 1,
            b: 1
        } ]
    }), nomatch({
        a: {
            $elemMatch: {
                x: 1,
                $or: [ {
                    a: 1
                }, {
                    b: 1
                } ]
            }
        }
    }, {
        a: [ {
            b: 1
        } ]
    }), nomatch({
        a: {
            $elemMatch: {
                x: 1,
                $or: [ {
                    a: 1
                }, {
                    b: 1
                } ]
            }
        }
    }, {
        a: [ {
            x: 1
        } ]
    }), nomatch({
        a: {
            $elemMatch: {
                x: 1,
                $or: [ {
                    a: 1
                }, {
                    b: 1
                } ]
            }
        }
    }, {
        a: [ {
            x: 1
        }, {
            b: 1
        } ]
    }), match({
        a: 5,
        $comment: "asdf"
    }, {
        a: 5
    }), nomatch({
        a: 6,
        $comment: "asdf"
    }, {
        a: 5
    });
}), Tinytest.add("minimongo - projection_compiler", function(test) {
    var testProjection = function(projection, tests) {
        var projection_f = LocalCollection._compileProjection(projection), equalNonStrict = function(a, b, desc) {
            test.isTrue(_.isEqual(a, b), desc);
        };
        _.each(tests, function(testCase) {
            equalNonStrict(projection_f(testCase[0]), testCase[1], testCase[2]);
        });
    };
    testProjection({
        foo: 1,
        bar: 1
    }, [ [ {
        foo: 42,
        bar: "something",
        baz: "else"
    }, {
        foo: 42,
        bar: "something"
    }, "simplest - whitelist" ], [ {
        foo: {
            nested: 17
        },
        baz: {}
    }, {
        foo: {
            nested: 17
        }
    }, "nested whitelisted field" ], [ {
        _id: "uid",
        bazbaz: 42
    }, {
        _id: "uid"
    }, "simplest whitelist - preserve _id" ] ]), testProjection({
        foo: 0,
        bar: 0
    }, [ [ {
        foo: 42,
        bar: "something",
        baz: "else"
    }, {
        baz: "else"
    }, "simplest - blacklist" ], [ {
        foo: {
            nested: 17
        },
        baz: {
            foo: "something"
        }
    }, {
        baz: {
            foo: "something"
        }
    }, "nested blacklisted field" ], [ {
        _id: "uid",
        bazbaz: 42
    }, {
        _id: "uid",
        bazbaz: 42
    }, "simplest blacklist - preserve _id" ] ]), testProjection({
        _id: 0,
        foo: 1
    }, [ [ {
        foo: 42,
        bar: 33,
        _id: "uid"
    }, {
        foo: 42
    }, "whitelist - _id blacklisted" ] ]), testProjection({
        _id: 0,
        foo: 0
    }, [ [ {
        foo: 42,
        bar: 33,
        _id: "uid"
    }, {
        bar: 33
    }, "blacklist - _id blacklisted" ] ]), testProjection({
        "foo.bar.baz": 1
    }, [ [ {
        foo: {
            meh: "fur",
            bar: {
                baz: 42
            },
            tr: 1
        },
        bar: 33,
        baz: "trolololo"
    }, {
        foo: {
            bar: {
                baz: 42
            }
        }
    }, "whitelist nested" ], [ {
        foo: {
            meh: "fur",
            bar: "nope",
            tr: 1
        },
        bar: 33,
        baz: "trolololo"
    }, {
        foo: {}
    }, "whitelist nested - path not found in doc, different type" ], [ {
        foo: {
            meh: "fur",
            bar: [],
            tr: 1
        },
        bar: 33,
        baz: "trolololo"
    }, {
        foo: {
            bar: []
        }
    }, "whitelist nested - path not found in doc" ] ]), testProjection({
        "hope.humanity": 0,
        "hope.people": 0
    }, [ [ {
        hope: {
            humanity: "lost",
            people: "broken",
            candies: "long live!"
        }
    }, {
        hope: {
            candies: "long live!"
        }
    }, "blacklist nested" ], [ {
        hope: "new"
    }, {
        hope: "new"
    }, "blacklist nested - path not found in doc" ] ]), testProjection({
        _id: 1
    }, [ [ {
        _id: 42,
        x: 1,
        y: {
            z: "2"
        }
    }, {
        _id: 42
    }, "_id whitelisted" ], [ {
        _id: 33
    }, {
        _id: 33
    }, "_id whitelisted, _id only" ], [ {
        x: 1
    }, {}, "_id whitelisted, no _id" ] ]), testProjection({
        _id: 0
    }, [ [ {
        _id: 42,
        x: 1,
        y: {
            z: "2"
        }
    }, {
        x: 1,
        y: {
            z: "2"
        }
    }, "_id blacklisted" ], [ {
        _id: 33
    }, {}, "_id blacklisted, _id only" ], [ {
        x: 1
    }, {
        x: 1
    }, "_id blacklisted, no _id" ] ]), testProjection({}, [ [ {
        a: 1,
        b: 2,
        c: "3"
    }, {
        a: 1,
        b: 2,
        c: "3"
    }, "empty projection" ] ]), test["throws"](function() {
        testProjection({
            inc: 1,
            excl: 0
        }, [ [ {
            inc: 42,
            excl: 42
        }, {
            inc: 42
        }, "Can't combine incl/excl rules" ] ]);
    }), test["throws"](function() {
        testProjection({
            a: 1,
            "a.b": 1
        }, [ [ {
            a: {
                b: 42
            }
        }, {
            a: {
                b: 42
            }
        }, "Can't have ambiguous rules (one is prefix of another)" ] ]);
    }), test["throws"](function() {
        testProjection({
            "a.b.c": 1,
            "a.b": 1,
            a: 1
        }, [ [ {
            a: {
                b: 42
            }
        }, {
            a: {
                b: 42
            }
        }, "Can't have ambiguous rules (one is prefix of another)" ] ]);
    }), test["throws"](function() {
        testProjection("some string", [ [ {
            a: {
                b: 42
            }
        }, {
            a: {
                b: 42
            }
        }, "Projection is not a hash" ] ]);
    });
}), Tinytest.add("minimongo - fetch with fields", function(test) {
    var c = new LocalCollection();
    _.times(30, function(i) {
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
    var fetchResults = c.find({}, {
        fields: {
            something: 1,
            "anything.foo": 1
        }
    }).fetch();
    test.isTrue(_.all(fetchResults, function(x) {
        return x && x.something && x.anything && x.anything.foo && "bar" === x.anything.foo && !_.has(x, "nothing") && !_.has(x.anything, "cool");
    })), fetchResults = c.find({
        nothing: {
            $gte: 5
        }
    }, {
        fields: {
            nothing: 0
        }
    }).fetch(), test.isTrue(_.all(fetchResults, function(x) {
        return x && x.something && x.anything && "bar" === x.anything.foo && "hot" === x.anything.cool && !_.has(x, "nothing") && x.i && x.i >= 5;
    })), test.isTrue(25 === fetchResults.length), fetchResults = c.find({}, {
        sort: {
            nothing: 1
        },
        limit: 10,
        skip: 10,
        fields: {
            i: 1,
            something: 1
        }
    }).fetch(), test.isTrue(_.all(fetchResults, function(x) {
        return x && x.something && x.i >= 10 && x.i < 20;
    })), _.each(fetchResults, function(x, i, arr) {
        i && test.isTrue(x.i === arr[i - 1].i + 1);
    }), test["throws"](function() {
        c.find({}, {
            fields: {
                "grades.$": 1
            }
        });
    }), test["throws"](function() {
        c.find({}, {
            fields: {
                grades: {
                    $elemMatch: {
                        mean: 70
                    }
                }
            }
        });
    }), test["throws"](function() {
        c.find({}, {
            fields: {
                grades: {
                    $slice: [ 20, 10 ]
                }
            }
        });
    });
}), Tinytest.add("minimongo - fetch with projection, subarrays", function(test) {
    var c = new LocalCollection();
    c.insert({
        setA: [ {
            fieldA: 42,
            fieldB: 33
        }, {
            fieldA: "the good",
            fieldB: "the bad",
            fieldC: "the ugly"
        } ],
        setB: [ {
            anotherA: {},
            anotherB: "meh"
        }, {
            anotherA: 1234,
            anotherB: 431
        } ]
    });
    var equalNonStrict = function(a, b, desc) {
        test.isTrue(_.isEqual(a, b), desc);
    }, testForProjection = function(projection, expected) {
        var fetched = c.find({}, {
            fields: projection
        }).fetch()[0];
        equalNonStrict(fetched, expected, "failed sub-set projection: " + JSON.stringify(projection));
    };
    testForProjection({
        "setA.fieldA": 1,
        "setB.anotherB": 1,
        _id: 0
    }, {
        setA: [ {
            fieldA: 42
        }, {
            fieldA: "the good"
        } ],
        setB: [ {
            anotherB: "meh"
        }, {
            anotherB: 431
        } ]
    }), testForProjection({
        "setA.fieldA": 0,
        "setB.anotherA": 0,
        _id: 0
    }, {
        setA: [ {
            fieldB: 33
        }, {
            fieldB: "the bad",
            fieldC: "the ugly"
        } ],
        setB: [ {
            anotherB: "meh"
        }, {
            anotherB: 431
        } ]
    }), c.remove({}), c.insert({
        a: [ [ {
            b: 1,
            c: 2
        }, {
            b: 2,
            c: 4
        } ], {
            b: 3,
            c: 5
        }, [ {
            b: 4,
            c: 9
        } ] ]
    }), testForProjection({
        "a.b": 1,
        _id: 0
    }, {
        a: [ [ {
            b: 1
        }, {
            b: 2
        } ], {
            b: 3
        }, [ {
            b: 4
        } ] ]
    }), testForProjection({
        "a.b": 0,
        _id: 0
    }, {
        a: [ [ {
            c: 2
        }, {
            c: 4
        } ], {
            c: 5
        }, [ {
            c: 9
        } ] ]
    });
}), Tinytest.add("minimongo - fetch with projection, deep copy", function(test) {
    var doc = {
        a: {
            x: 42
        },
        b: {
            y: {
                z: 33
            }
        },
        c: "asdf"
    }, fields = {
        a: 1,
        "b.y": 1
    }, projectionFn = LocalCollection._compileProjection(fields), filteredDoc = projectionFn(doc);
    doc.a.x++, doc.b.y.z--, test.equal(filteredDoc.a.x, 42, "projection returning deep copy - including"), 
    test.equal(filteredDoc.b.y.z, 33, "projection returning deep copy - including"), 
    fields = {
        c: 0
    }, projectionFn = LocalCollection._compileProjection(fields), filteredDoc = projectionFn(doc), 
    doc.a.x = 5, test.equal(filteredDoc.a.x, 43, "projection returning deep copy - excluding");
}), Tinytest.add("minimongo - observe ordered with projection", function(test) {
    var handle, operations = [], cbs = log_callbacks(operations), c = new LocalCollection();
    handle = c.find({}, {
        sort: {
            a: 1
        },
        fields: {
            a: 1
        }
    }).observe(cbs), test.isTrue(handle.collection === c), c.insert({
        _id: "foo",
        a: 1,
        b: 2
    }), test.equal(operations.shift(), [ "added", {
        a: 1
    }, 0, null ]), c.update({
        a: 1
    }, {
        $set: {
            a: 2,
            b: 1
        }
    }), test.equal(operations.shift(), [ "changed", {
        a: 2
    }, 0, {
        a: 1
    } ]), c.insert({
        _id: "bar",
        a: 10,
        c: 33
    }), test.equal(operations.shift(), [ "added", {
        a: 10
    }, 1, null ]), c.update({}, {
        $inc: {
            a: 1
        }
    }, {
        multi: !0
    }), c.update({}, {
        $inc: {
            c: 1
        }
    }, {
        multi: !0
    }), test.equal(operations.shift(), [ "changed", {
        a: 3
    }, 0, {
        a: 2
    } ]), test.equal(operations.shift(), [ "changed", {
        a: 11
    }, 1, {
        a: 10
    } ]), c.update({
        a: 11
    }, {
        a: 1,
        b: 44
    }), test.equal(operations.shift(), [ "changed", {
        a: 1
    }, 1, {
        a: 11
    } ]), test.equal(operations.shift(), [ "moved", {
        a: 1
    }, 1, 0, "foo" ]), c.remove({
        a: 2
    }), test.equal(operations.shift(), void 0), c.remove({
        a: 3
    }), test.equal(operations.shift(), [ "removed", "foo", 1, {
        a: 3
    } ]), handle.stop();
    var idA2 = Random.id();
    c.insert({
        _id: idA2,
        a: 2
    }), test.equal(operations.shift(), void 0);
    var cursor = c.find({}, {
        fields: {
            a: 1,
            _id: 0
        }
    });
    test["throws"](function() {
        cursor.observeChanges({
            added: function() {}
        });
    }), test["throws"](function() {
        cursor.observe({
            added: function() {}
        });
    }), handle = c.find({}, {
        sort: {
            a: -1
        },
        fields: {
            a: 1
        }
    }).observe(cbs), test.equal(operations.shift(), [ "added", {
        a: 2
    }, 0, null ]), test.equal(operations.shift(), [ "added", {
        a: 1
    }, 1, null ]), handle.stop(), handle = c.find({}, {
        sort: {
            a: -1
        },
        fields: {
            a: 1
        }
    }).observe(_.extend(cbs, {
        _suppress_initial: !0
    })), test.equal(operations.shift(), void 0), c.insert({
        a: 100,
        b: {
            foo: "bar"
        }
    }), test.equal(operations.shift(), [ "added", {
        a: 100
    }, 0, idA2 ]), handle.stop(), c.remove({}), handle = c.find({}, {
        sort: {
            a: 1
        },
        skip: 1,
        limit: 2,
        fields: {
            blacklisted: 0
        }
    }).observe(cbs), test.equal(operations.shift(), void 0), c.insert({
        a: 1,
        blacklisted: 1324
    }), test.equal(operations.shift(), void 0), c.insert({
        _id: "foo",
        a: 2,
        blacklisted: [ "something" ]
    }), test.equal(operations.shift(), [ "added", {
        a: 2
    }, 0, null ]), c.insert({
        a: 3,
        blacklisted: {
            2: 3
        }
    }), test.equal(operations.shift(), [ "added", {
        a: 3
    }, 1, null ]), c.insert({
        a: 4,
        blacklisted: 6
    }), test.equal(operations.shift(), void 0), c.update({
        a: 1
    }, {
        a: 0,
        blacklisted: 4444
    }), test.equal(operations.shift(), void 0), c.update({
        a: 0
    }, {
        a: 5,
        blacklisted: 11111
    }), test.equal(operations.shift(), [ "removed", "foo", 0, {
        a: 2
    } ]), test.equal(operations.shift(), [ "added", {
        a: 4
    }, 1, null ]), c.update({
        a: 3
    }, {
        a: 3.5,
        blacklisted: 333.4444
    }), test.equal(operations.shift(), [ "changed", {
        a: 3.5
    }, 0, {
        a: 3
    } ]), handle.stop(), c.remove({}), handle = c.find({}, {
        sort: {
            a: 1
        },
        fields: {
            a: 1
        }
    }).observe(_.extend(cbs, {
        _no_indices: !0
    })), c.insert({
        _id: "foo",
        a: 1,
        zoo: "crazy"
    }), test.equal(operations.shift(), [ "added", {
        a: 1
    }, -1, null ]), c.update({
        a: 1
    }, {
        $set: {
            a: 2,
            foobar: "player"
        }
    }), test.equal(operations.shift(), [ "changed", {
        a: 2
    }, -1, {
        a: 1
    } ]), c.insert({
        a: 10,
        b: 123.45
    }), test.equal(operations.shift(), [ "added", {
        a: 10
    }, -1, null ]), c.update({}, {
        $inc: {
            a: 1,
            b: 2
        }
    }, {
        multi: !0
    }), test.equal(operations.shift(), [ "changed", {
        a: 3
    }, -1, {
        a: 2
    } ]), test.equal(operations.shift(), [ "changed", {
        a: 11
    }, -1, {
        a: 10
    } ]), c.update({
        a: 11,
        b: 125.45
    }, {
        a: 1,
        b: 444
    }), test.equal(operations.shift(), [ "changed", {
        a: 1
    }, -1, {
        a: 11
    } ]), test.equal(operations.shift(), [ "moved", {
        a: 1
    }, -1, -1, "foo" ]), c.remove({
        a: 2
    }), test.equal(operations.shift(), void 0), c.remove({
        a: 3
    }), test.equal(operations.shift(), [ "removed", "foo", -1, {
        a: 3
    } ]), handle.stop();
}), Tinytest.add("minimongo - ordering", function(test) {
    var shortBinary = EJSON.newBinary(1);
    shortBinary[0] = 128;
    var longBinary1 = EJSON.newBinary(2);
    longBinary1[1] = 42;
    var longBinary2 = EJSON.newBinary(2);
    longBinary2[1] = 50;
    var date1 = new Date(), date2 = new Date(date1.getTime() + 1e3);
    assert_ordering(test, LocalCollection._f._cmp, [ null, 1, 2.2, 3, "03", "1", "11", "2", "a", "aaa", {}, {
        a: 2
    }, {
        a: 3
    }, {
        a: 3,
        b: 4
    }, {
        b: 4
    }, {
        b: 4,
        a: 3
    }, {
        b: {}
    }, {
        b: [ 1, 2, 3 ]
    }, {
        b: [ 1, 2, 4 ]
    }, [], [ 1, 2 ], [ 1, 2, 3 ], [ 1, 2, 4 ], [ 1, 2, "4" ], [ 1, 2, [ 4 ] ], shortBinary, longBinary1, longBinary2, new LocalCollection._ObjectID("1234567890abcd1234567890"), new LocalCollection._ObjectID("abcd1234567890abcd123456"), !1, !0, date1, date2 ]);
    var verify = function(sorts, docs) {
        _.each(_.isArray(sorts) ? sorts : [ sorts ], function(sort) {
            var sorter = new Minimongo.Sorter(sort);
            assert_ordering(test, sorter.getComparator(), docs);
        });
    };
    verify([ {
        a: 1
    }, [ "a" ], [ [ "a", "asc" ] ] ], [ {
        a: []
    }, {
        a: 1
    }, {
        a: {}
    }, {
        a: !0
    } ]), verify([ {
        a: 1
    }, [ "a" ], [ [ "a", "asc" ] ] ], [ {
        c: 1
    }, {
        a: 1
    }, {
        a: {}
    }, {
        a: !0
    } ]), verify([ {
        a: -1
    }, [ [ "a", "desc" ] ] ], [ {
        a: !0
    }, {
        a: {}
    }, {
        a: 1
    }, {
        c: 1
    } ]), verify([ {
        a: -1
    }, [ [ "a", "desc" ] ] ], [ {
        a: !0
    }, {
        a: {}
    }, {
        a: 1
    }, {
        a: []
    } ]), verify([ {
        a: 1,
        b: -1
    }, [ "a", [ "b", "desc" ] ], [ [ "a", "asc" ], [ "b", "desc" ] ] ], [ {
        c: 1
    }, {
        a: 1,
        b: 3
    }, {
        a: 1,
        b: 2
    }, {
        a: 2,
        b: 0
    } ]), verify([ {
        a: 1,
        b: 1
    }, [ "a", "b" ], [ [ "a", "asc" ], [ "b", "asc" ] ] ], [ {
        c: 1
    }, {
        a: 1,
        b: 2
    }, {
        a: 1,
        b: 3
    }, {
        a: 2,
        b: 0
    } ]), test["throws"](function() {
        new Minimongo.Sorter("a");
    }), test["throws"](function() {
        new Minimongo.Sorter(123);
    }), test["throws"](function() {
        new Minimongo.Sorter({
            $natural: 1
        });
    }), test.equal(new Minimongo.Sorter({}).getComparator()({
        a: 1
    }, {
        a: 2
    }), 0), verify({
        a: 1
    }, [ {
        a: [ 1, 10, 20 ]
    }, {
        a: [ 5, 2, 99 ]
    } ]), verify({
        a: -1
    }, [ {
        a: [ 5, 2, 99 ]
    }, {
        a: [ 1, 10, 20 ]
    } ]), verify({
        "a.1": 1
    }, [ {
        a: [ 5, 2, 99 ]
    }, {
        a: [ 1, 10, 20 ]
    } ]), verify({
        a: 1
    }, [ {
        a: [ 1, [ 10, 15 ], 20 ]
    }, {
        a: [ 5, [ -5, -20 ], 18 ]
    } ]), verify({
        a: -1
    }, [ {
        a: [ 1, [ 10, 15 ], 20 ]
    }, {
        a: [ 5, [ -5, -20 ], 18 ]
    } ]), verify({
        "a.0": 1
    }, [ {
        a: [ 1, [ 10, 15 ], 20 ]
    }, {
        a: [ 5, [ -5, -20 ], 18 ]
    } ]), verify({
        "a.0": -1
    }, [ {
        a: [ 5, [ -5, -20 ], 18 ]
    }, {
        a: [ 1, [ 10, 15 ], 20 ]
    } ]), verify({
        "a.1": 1
    }, [ {
        a: [ 5, [ -5, -20 ], 18 ]
    }, {
        a: [ 1, [ 10, 15 ], 20 ]
    } ]), verify({
        "a.1": -1
    }, [ {
        a: [ 1, [ 10, 15 ], 20 ]
    }, {
        a: [ 5, [ -5, -20 ], 18 ]
    } ]), verify({
        "a.1": 1
    }, [ {
        a: [ 1, [ 10, 15 ], 20 ]
    }, {
        a: [ 5, [ 19, 3 ], 18 ]
    } ]), verify({
        "a.1": -1
    }, [ {
        a: [ 5, [ 19, 3 ], 18 ]
    }, {
        a: [ 1, [ 10, 15 ], 20 ]
    } ]), verify({
        a: 1
    }, [ {
        a: [ 1, [ 10, 15 ], 20 ]
    }, {
        a: [ 5, [ 19, 3 ], 18 ]
    } ]), verify({
        a: -1
    }, [ {
        a: [ 5, [ 19, 3 ], 18 ]
    }, {
        a: [ 1, [ 10, 15 ], 20 ]
    } ]), verify({
        a: -1
    }, [ {
        a: [ 1, [ 10, 15 ], 20 ]
    }, {
        a: [ 5, [ 3, 19 ], 18 ]
    } ]), verify({
        "a.x": 1,
        "a.y": 1
    }, [ {
        a: [ {
            x: 0,
            y: 4
        } ]
    }, {
        a: [ {
            x: 0,
            y: 5
        }, {
            x: 1,
            y: 3
        } ]
    } ]), verify({
        "a.0.s": 1
    }, [ {
        a: [ {
            s: 1
        } ]
    }, {
        a: [ {
            s: 2
        } ]
    } ]);
}), Tinytest.add("minimongo - sort", function(test) {
    for (var c = new LocalCollection(), i = 0; 50 > i; i++) for (var j = 0; 2 > j; j++) c.insert({
        a: i,
        b: j,
        _id: i + "_" + j
    });
    test.equal(c.find({
        a: {
            $gt: 10
        }
    }, {
        sort: {
            b: -1,
            a: 1
        },
        limit: 5
    }).fetch(), [ {
        a: 11,
        b: 1,
        _id: "11_1"
    }, {
        a: 12,
        b: 1,
        _id: "12_1"
    }, {
        a: 13,
        b: 1,
        _id: "13_1"
    }, {
        a: 14,
        b: 1,
        _id: "14_1"
    }, {
        a: 15,
        b: 1,
        _id: "15_1"
    } ]), test.equal(c.find({
        a: {
            $gt: 10
        }
    }, {
        sort: {
            b: -1,
            a: 1
        },
        skip: 3,
        limit: 5
    }).fetch(), [ {
        a: 14,
        b: 1,
        _id: "14_1"
    }, {
        a: 15,
        b: 1,
        _id: "15_1"
    }, {
        a: 16,
        b: 1,
        _id: "16_1"
    }, {
        a: 17,
        b: 1,
        _id: "17_1"
    }, {
        a: 18,
        b: 1,
        _id: "18_1"
    } ]), test.equal(c.find({
        a: {
            $gte: 20
        }
    }, {
        sort: {
            a: 1,
            b: -1
        },
        skip: 50,
        limit: 5
    }).fetch(), [ {
        a: 45,
        b: 1,
        _id: "45_1"
    }, {
        a: 45,
        b: 0,
        _id: "45_0"
    }, {
        a: 46,
        b: 1,
        _id: "46_1"
    }, {
        a: 46,
        b: 0,
        _id: "46_0"
    }, {
        a: 47,
        b: 1,
        _id: "47_1"
    } ]);
}), Tinytest.add("minimongo - subkey sort", function(test) {
    var c = new LocalCollection();
    c.insert({
        a: {
            b: 2
        }
    }), c.insert({
        a: {
            b: 1
        }
    }), c.insert({
        a: {
            b: 3
        }
    }), test.equal(_.pluck(c.find({}, {
        sort: {
            "a.b": -1
        }
    }).fetch(), "a"), [ {
        b: 3
    }, {
        b: 2
    }, {
        b: 1
    } ]), c.insert({
        a: 1
    }), test.equal(_.pluck(c.find({}, {
        sort: {
            "a.b": 1
        }
    }).fetch(), "a"), [ 1, {
        b: 1
    }, {
        b: 2
    }, {
        b: 3
    } ]), c.insert({
        a: {
            b: {
                c: 1
            }
        }
    }), test.equal(_.pluck(c.find({}, {
        sort: {
            "a.b": -1
        }
    }).fetch(), "a"), [ {
        b: {
            c: 1
        }
    }, {
        b: 3
    }, {
        b: 2
    }, {
        b: 1
    }, 1 ]), c.insert({
        c: 1
    }), test.equal(_.pluck(c.find({}, {
        sort: {
            "a.b": -1
        }
    }).fetch(), "a"), [ {
        b: {
            c: 1
        }
    }, {
        b: 3
    }, {
        b: 2
    }, {
        b: 1
    }, 1, void 0 ]), test.equal(c.find({}, {
        sort: {
            "a.nope.c": -1
        }
    }).count(), 6);
}), Tinytest.add("minimongo - array sort", function(test) {
    var c = new LocalCollection();
    c.insert({
        up: 1,
        down: 1,
        selected: 2,
        a: {
            x: [ 1, 4 ]
        }
    }), c.insert({
        up: 2,
        down: 2,
        selected: 0,
        a: [ {
            x: [ 2 ]
        }, {
            x: 3
        } ]
    }), c.insert({
        up: 0,
        down: 4,
        a: {
            x: 0
        }
    }), c.insert({
        up: 3,
        down: 3,
        selected: 1,
        a: {
            x: 2.5
        }
    }), c.insert({
        up: 4,
        down: 0,
        selected: 3,
        a: {
            x: 5
        }
    });
    var testCursorMatchesField = function(cursor, field) {
        var fieldValues = [];
        c.find().forEach(function(doc) {
            _.has(doc, field) && fieldValues.push(doc[field]);
        }), test.equal(_.pluck(cursor.fetch(), field), _.range(_.max(fieldValues) + 1));
    };
    testCursorMatchesField(c.find({}, {
        sort: {
            "a.x": 1
        }
    }), "up"), testCursorMatchesField(c.find({}, {
        sort: {
            "a.x": -1
        }
    }), "down"), testCursorMatchesField(c.find({
        "a.x": {
            $gt: 1
        }
    }, {
        sort: {
            "a.x": 1
        }
    }), "selected");
}), Tinytest.add("minimongo - sort keys", function(test) {
    var keyListToObject = function(keyList) {
        var obj = {};
        return _.each(keyList, function(key) {
            obj[EJSON.stringify(key)] = !0;
        }), obj;
    }, testKeys = function(sortSpec, doc, expectedKeyList) {
        var expectedKeys = keyListToObject(expectedKeyList), sorter = new Minimongo.Sorter(sortSpec), actualKeyList = [];
        sorter._generateKeysFromDoc(doc, function(key) {
            actualKeyList.push(key);
        });
        var actualKeys = keyListToObject(actualKeyList);
        test.equal(actualKeys, expectedKeys);
    }, testParallelError = function(sortSpec, doc) {
        var sorter = new Minimongo.Sorter(sortSpec);
        test["throws"](function() {
            sorter._generateKeysFromDoc(doc, function() {});
        }, /parallel arrays/);
    };
    testKeys({
        "a.x": 1,
        "a.y": 1
    }, {
        a: {
            x: 0,
            y: 5
        }
    }, [ [ 0, 5 ] ]), testKeys({
        "a.x": 1,
        "a.y": 1
    }, {
        a: [ {
            x: 0,
            y: 5
        }, {
            x: 1,
            y: 3
        } ]
    }, [ [ 0, 5 ], [ 1, 3 ] ]), testKeys({
        "a.x": 1,
        "a.y": 1,
        b: -1
    }, {
        a: [ {
            x: 0,
            y: 5
        }, {
            x: 1,
            y: 3
        } ],
        b: 42
    }, [ [ 0, 5, 42 ], [ 1, 3, 42 ] ]), testKeys({
        b: -1,
        "a.x": 1,
        "a.y": 1
    }, {
        a: [ {
            x: 0,
            y: 5
        }, {
            x: 1,
            y: 3
        } ],
        b: 42
    }, [ [ 42, 0, 5 ], [ 42, 1, 3 ] ]), testKeys({
        "a.x": 1,
        b: -1,
        "a.y": 1
    }, {
        a: [ {
            x: 0,
            y: 5
        }, {
            x: 1,
            y: 3
        } ],
        b: 42
    }, [ [ 0, 42, 5 ], [ 1, 42, 3 ] ]), testKeys({
        a: 1,
        b: 1
    }, {
        a: [ 1, 2, 3 ],
        b: 42
    }, [ [ 1, 42 ], [ 2, 42 ], [ 3, 42 ] ]), testParallelError({
        a: 1,
        b: 1
    }, {
        a: [ 1, 2, 3 ],
        b: [ 42 ]
    }), testParallelError({
        "a.x": 1,
        "a.y": 1
    }, {
        a: [ {
            x: 1,
            y: [ 2, 3 ]
        }, {
            x: 2,
            y: [ 4, 5 ]
        } ]
    });
}), Tinytest.add("minimongo - sort key filter", function(test) {
    var testOrder = function(sortSpec, selector, doc1, doc2) {
        var matcher = new Minimongo.Matcher(selector), sorter = new Minimongo.Sorter(sortSpec, {
            matcher: matcher
        }), comparator = sorter.getComparator(), comparison = comparator(doc1, doc2);
        test.isTrue(0 > comparison);
    };
    testOrder({
        "a.x": 1
    }, {
        "a.x": {
            $gt: 1
        }
    }, {
        a: {
            x: 3
        }
    }, {
        a: {
            x: [ 1, 4 ]
        }
    }), testOrder({
        "a.x": 1
    }, {
        "a.x": {
            $gt: 0
        }
    }, {
        a: {
            x: [ 1, 4 ]
        }
    }, {
        a: {
            x: 3
        }
    });
    var keyCompatible = function(sortSpec, selector, key, compatible) {
        var matcher = new Minimongo.Matcher(selector), sorter = new Minimongo.Sorter(sortSpec, {
            matcher: matcher
        }), actual = sorter._keyCompatibleWithSelector(key);
        test.equal(actual, compatible);
    };
    keyCompatible({
        a: 1
    }, {
        a: 5
    }, [ 5 ], !0), keyCompatible({
        a: 1
    }, {
        a: 5
    }, [ 8 ], !1), keyCompatible({
        a: 1
    }, {
        a: {
            x: 5
        }
    }, [ {
        x: 5
    } ], !0), keyCompatible({
        a: 1
    }, {
        a: {
            x: 5
        }
    }, [ {
        x: 5,
        y: 9
    } ], !1), keyCompatible({
        "a.x": 1
    }, {
        a: {
            x: 5
        }
    }, [ 5 ], !0), keyCompatible({
        "a.x": 1
    }, {
        a: {
            x: 5
        }
    }, [ 1 ], !0), keyCompatible({
        "a.x": 1
    }, {
        "a.x": 5
    }, [ 5 ], !0), keyCompatible({
        "a.x": 1
    }, {
        "a.x": 5
    }, [ 1 ], !1), keyCompatible({
        a: 1
    }, {
        a: /^foo+/
    }, [ "foo" ], !0), keyCompatible({
        a: 1
    }, {
        a: /^foo+/
    }, [ "foooo" ], !0), keyCompatible({
        a: 1
    }, {
        a: /^foo+/
    }, [ "foooobar" ], !0), keyCompatible({
        a: 1
    }, {
        a: /^foo+/
    }, [ "afoooo" ], !1), keyCompatible({
        a: 1
    }, {
        a: /^foo+/
    }, [ "" ], !1), keyCompatible({
        a: 1
    }, {
        a: {
            $regex: "^foo+"
        }
    }, [ "foo" ], !0), keyCompatible({
        a: 1
    }, {
        a: {
            $regex: "^foo+"
        }
    }, [ "foooo" ], !0), keyCompatible({
        a: 1
    }, {
        a: {
            $regex: "^foo+"
        }
    }, [ "foooobar" ], !0), keyCompatible({
        a: 1
    }, {
        a: {
            $regex: "^foo+"
        }
    }, [ "afoooo" ], !1), keyCompatible({
        a: 1
    }, {
        a: {
            $regex: "^foo+"
        }
    }, [ "" ], !1), keyCompatible({
        a: 1
    }, {
        a: /^foo+/i
    }, [ "foo" ], !0), keyCompatible({
        a: 1
    }, {
        a: /^foo+/i
    }, [ "bar" ], !0), keyCompatible({
        a: 1
    }, {
        a: /^foo+/m
    }, [ "bar" ], !0), keyCompatible({
        a: 1
    }, {
        a: {
            $regex: "^foo+",
            $options: "i"
        }
    }, [ "bar" ], !0), keyCompatible({
        a: 1
    }, {
        a: {
            $regex: "^foo+",
            $options: "m"
        }
    }, [ "bar" ], !0), keyCompatible({
        a: 1,
        b: 1,
        c: 1
    }, {
        a: {
            $gt: 5
        },
        c: {
            $lt: 3
        }
    }, [ 6, "bla", 2 ], !0), keyCompatible({
        a: 1,
        b: 1,
        c: 1
    }, {
        a: {
            $gt: 5
        },
        c: {
            $lt: 3
        }
    }, [ 6, "bla", 4 ], !1), keyCompatible({
        a: 1,
        b: 1,
        c: 1
    }, {
        a: {
            $gt: 5
        },
        c: {
            $lt: 3
        }
    }, [ 3, "bla", 1 ], !1), keyCompatible({
        a: 1,
        b: 1,
        c: 1
    }, {
        c: {
            $lt: 3
        }
    }, [ 3, "bla", 4 ], !0);
}), Tinytest.add("minimongo - binary search", function(test) {
    var forwardCmp = function(a, b) {
        return a - b;
    }, backwardCmp = function(a, b) {
        return -1 * forwardCmp(a, b);
    }, checkSearch = function(cmp, array, value, expected, message) {
        var actual = LocalCollection._binarySearch(cmp, array, value);
        expected != actual && test.fail({
            type: "minimongo-binary-search",
            message: message + " : Expected index " + expected + " but had " + actual
        });
    }, checkSearchForward = function(array, value, expected, message) {
        checkSearch(forwardCmp, array, value, expected, message);
    }, checkSearchBackward = function(array, value, expected, message) {
        checkSearch(backwardCmp, array, value, expected, message);
    };
    checkSearchForward([ 1, 2, 5, 7 ], 4, 2, "Inner insert"), checkSearchForward([ 1, 2, 3, 4 ], 3, 3, "Inner insert, equal value"), 
    checkSearchForward([ 1, 2, 5 ], 4, 2, "Inner insert, odd length"), checkSearchForward([ 1, 3, 5, 6 ], 9, 4, "End insert"), 
    checkSearchForward([ 1, 3, 5, 6 ], 0, 0, "Beginning insert"), checkSearchForward([ 1 ], 0, 0, "Single array, less than."), 
    checkSearchForward([ 1 ], 1, 1, "Single array, equal."), checkSearchForward([ 1 ], 2, 1, "Single array, greater than."), 
    checkSearchForward([], 1, 0, "Empty array"), checkSearchForward([ 1, 1, 1, 2, 2, 2, 2 ], 1, 3, "Highly degenerate array, lower"), 
    checkSearchForward([ 1, 1, 1, 2, 2, 2, 2 ], 2, 7, "Highly degenerate array, upper"), 
    checkSearchForward([ 2, 2, 2, 2, 2, 2, 2 ], 1, 0, "Highly degenerate array, lower"), 
    checkSearchForward([ 2, 2, 2, 2, 2, 2, 2 ], 2, 7, "Highly degenerate array, equal"), 
    checkSearchForward([ 2, 2, 2, 2, 2, 2, 2 ], 3, 7, "Highly degenerate array, upper"), 
    checkSearchBackward([ 7, 5, 2, 1 ], 4, 2, "Backward: Inner insert"), checkSearchBackward([ 4, 3, 2, 1 ], 3, 2, "Backward: Inner insert, equal value"), 
    checkSearchBackward([ 5, 2, 1 ], 4, 1, "Backward: Inner insert, odd length"), checkSearchBackward([ 6, 5, 3, 1 ], 9, 0, "Backward: Beginning insert"), 
    checkSearchBackward([ 6, 5, 3, 1 ], 0, 4, "Backward: End insert"), checkSearchBackward([ 1 ], 0, 1, "Backward: Single array, less than."), 
    checkSearchBackward([ 1 ], 1, 1, "Backward: Single array, equal."), checkSearchBackward([ 1 ], 2, 0, "Backward: Single array, greater than."), 
    checkSearchBackward([], 1, 0, "Backward: Empty array"), checkSearchBackward([ 2, 2, 2, 2, 1, 1, 1 ], 1, 7, "Backward: Degenerate array, lower"), 
    checkSearchBackward([ 2, 2, 2, 2, 1, 1, 1 ], 2, 4, "Backward: Degenerate array, upper"), 
    checkSearchBackward([ 2, 2, 2, 2, 2, 2, 2 ], 1, 7, "Backward: Highly degenerate array, upper"), 
    checkSearchBackward([ 2, 2, 2, 2, 2, 2, 2 ], 2, 7, "Backward: Highly degenerate array, upper"), 
    checkSearchBackward([ 2, 2, 2, 2, 2, 2, 2 ], 3, 0, "Backward: Highly degenerate array, upper");
}), Tinytest.add("minimongo - modify", function(test) {
    var modifyWithQuery = function(doc, query, mod, expected) {
        var coll = new LocalCollection();
        coll.insert(doc), coll.update(query, mod);
        var actual = coll.findOne();
        delete actual._id, test.equal(actual, expected, EJSON.stringify({
            input: doc,
            mod: mod
        }));
    }, modify = function(doc, mod, expected) {
        modifyWithQuery(doc, {}, mod, expected);
    }, exceptionWithQuery = function(doc, query, mod) {
        var coll = new LocalCollection();
        coll.insert(doc), test["throws"](function() {
            coll.update(query, mod);
        });
    }, exception = function(doc, mod) {
        exceptionWithQuery(doc, {}, mod);
    };
    modify({}, {}, {}), modify({
        a: 12
    }, {}, {}), modify({
        a: 12
    }, {
        a: 13
    }, {
        a: 13
    }), modify({
        a: 12,
        b: 99
    }, {
        a: 13
    }, {
        a: 13
    }), exception({
        a: 12
    }, {
        a: 13,
        $set: {
            b: 13
        }
    }), exception({
        a: 12
    }, {
        $set: {
            b: 13
        },
        a: 13
    }), modify({}, {
        $set: {
            a: 12
        }
    }, {
        a: 12
    }), modify({}, {
        $set: {
            "a.b": 12
        }
    }, {
        a: {
            b: 12
        }
    }), modify({}, {
        $set: {
            "a.b.c": 12
        }
    }, {
        a: {
            b: {
                c: 12
            }
        }
    }), modify({
        a: {
            d: 99
        }
    }, {
        $set: {
            "a.b.c": 12
        }
    }, {
        a: {
            d: 99,
            b: {
                c: 12
            }
        }
    }), modify({}, {
        $set: {
            "a.b.3.c": 12
        }
    }, {
        a: {
            b: {
                3: {
                    c: 12
                }
            }
        }
    }), modify({
        a: {
            b: []
        }
    }, {
        $set: {
            "a.b.3.c": 12
        }
    }, {
        a: {
            b: [ null, null, null, {
                c: 12
            } ]
        }
    }), exception({
        a: [ null, null, null ]
    }, {
        $set: {
            "a.1.b": 12
        }
    }), exception({
        a: [ null, 1, null ]
    }, {
        $set: {
            "a.1.b": 12
        }
    }), exception({
        a: [ null, "x", null ]
    }, {
        $set: {
            "a.1.b": 12
        }
    }), exception({
        a: [ null, [], null ]
    }, {
        $set: {
            "a.1.b": 12
        }
    }), modify({
        a: [ null, null, null ]
    }, {
        $set: {
            "a.3.b": 12
        }
    }, {
        a: [ null, null, null, {
            b: 12
        } ]
    }), exception({
        a: []
    }, {
        $set: {
            "a.b": 12
        }
    }), exception({
        a: 12
    }, {
        $set: {
            "a.b": 99
        }
    }), exception({
        a: "x"
    }, {
        $set: {
            "a.b": 99
        }
    }), exception({
        a: !0
    }, {
        $set: {
            "a.b": 99
        }
    }), exception({
        a: null
    }, {
        $set: {
            "a.b": 99
        }
    }), modify({
        a: {}
    }, {
        $set: {
            "a.3": 12
        }
    }, {
        a: {
            "3": 12
        }
    }), modify({
        a: []
    }, {
        $set: {
            "a.3": 12
        }
    }, {
        a: [ null, null, null, 12 ]
    }), exception({}, {
        $set: {
            "": 12
        }
    }), exception({}, {
        $set: {
            ".": 12
        }
    }), exception({}, {
        $set: {
            "a.": 12
        }
    }), exception({}, {
        $set: {
            ". ": 12
        }
    }), exception({}, {
        $inc: {
            "... ": 12
        }
    }), exception({}, {
        $set: {
            "a..b": 12
        }
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $set: {
            "a.01": 99
        }
    }, {
        a: [ 1, 99, 3 ]
    }), modify({
        a: [ 1, {
            a: 98
        }, 3 ]
    }, {
        $set: {
            "a.01.b": 99
        }
    }, {
        a: [ 1, {
            a: 98,
            b: 99
        }, 3 ]
    }), modify({}, {
        $set: {
            "2.a.b": 12
        }
    }, {
        "2": {
            a: {
                b: 12
            }
        }
    }), exception({
        x: []
    }, {
        $set: {
            "x.2..a": 99
        }
    }), modify({
        x: [ null, null ]
    }, {
        $set: {
            "x.2.a": 1
        }
    }, {
        x: [ null, null, {
            a: 1
        } ]
    }), exception({
        x: [ null, null ]
    }, {
        $set: {
            "x.1.a": 1
        }
    }), modifyWithQuery({
        a: [ {
            x: 2
        }, {
            x: 4
        } ]
    }, {
        "a.x": 4
    }, {
        $set: {
            "a.$.z": 9
        }
    }, {
        a: [ {
            x: 2
        }, {
            x: 4,
            z: 9
        } ]
    }), exception({
        a: [ {
            x: 2
        }, {
            x: 4
        } ]
    }, {
        $set: {
            "a.$.z": 9
        }
    }), exceptionWithQuery({
        a: [ {
            x: 2
        }, {
            x: 4
        } ],
        b: 5
    }, {
        b: 5
    }, {
        $set: {
            "a.$.z": 9
        }
    }), exceptionWithQuery({
        a: [ {
            x: [ 2 ]
        } ]
    }, {
        "a.x": 2
    }, {
        $set: {
            "a.$.x.$": 9
        }
    }), modifyWithQuery({
        a: [ 5, 6, 7 ]
    }, {
        a: 6
    }, {
        $set: {
            "a.$": 9
        }
    }, {
        a: [ 5, 9, 7 ]
    }), modifyWithQuery({
        a: [ {
            b: [ {
                c: 9
            }, {
                c: 10
            } ]
        }, {
            b: {
                c: 11
            }
        } ]
    }, {
        "a.b.c": 10
    }, {
        $unset: {
            "a.$.b": 1
        }
    }, {
        a: [ {}, {
            b: {
                c: 11
            }
        } ]
    }), modifyWithQuery({
        a: [ {
            b: [ {
                c: 9
            }, {
                c: 10
            } ]
        }, {
            b: {
                c: 11
            }
        } ]
    }, {
        "a.b.c": 11
    }, {
        $unset: {
            "a.$.b": 1
        }
    }, {
        a: [ {
            b: [ {
                c: 9
            }, {
                c: 10
            } ]
        }, {} ]
    }), modifyWithQuery({
        a: [ 1 ]
    }, {
        "a.0": 1
    }, {
        $set: {
            "a.$": 5
        }
    }, {
        a: [ 5 ]
    }), modifyWithQuery({
        a: [ 9 ]
    }, {
        a: {
            $mod: [ 2, 1 ]
        }
    }, {
        $set: {
            "a.$": 5
        }
    }, {
        a: [ 5 ]
    }), exceptionWithQuery({
        a: [ 1 ]
    }, {
        $not: {
            a: 2
        }
    }, {
        $set: {
            "a.$": 5
        }
    }), exceptionWithQuery({
        a: [ 1 ]
    }, {
        "a.0": {
            $ne: 2
        }
    }, {
        $set: {
            "a.$": 5
        }
    }), modifyWithQuery({
        a: [ {
            x: 2
        }, {
            x: 4
        } ]
    }, {
        $or: [ {
            "a.x": 4
        } ]
    }, {
        $set: {
            "a.$.z": 9
        }
    }, {
        a: [ {
            x: 2
        }, {
            x: 4,
            z: 9
        } ]
    }), exceptionWithQuery({
        a: [ {
            x: 2
        }, {
            x: 4
        } ]
    }, {
        $or: [ {
            "a.x": 4
        }, {
            "a.x": 4
        } ]
    }, {
        $set: {
            "a.$.z": 9
        }
    }), modifyWithQuery({
        a: [ {
            x: 1
        }, {
            x: 3
        } ]
    }, {
        $and: [ {
            "a.x": 1
        }, {
            "a.x": 3
        } ]
    }, {
        $set: {
            "a.$.x": 5
        }
    }, {
        a: [ {
            x: 1
        }, {
            x: 5
        } ]
    }), modifyWithQuery({
        a: [ {
            x: 1
        }, {
            x: 3
        } ]
    }, {
        $and: [ {
            "a.x": 3
        }, {
            "a.x": 1
        } ]
    }, {
        $set: {
            "a.$.x": 5
        }
    }, {
        a: [ {
            x: 5
        }, {
            x: 3
        } ]
    }), modifyWithQuery({
        a: [ {
            x: 1
        }, {
            y: 3
        } ]
    }, {
        "a.x": 1,
        "a.y": 3
    }, {
        $set: {
            "a.$.z": 5
        }
    }, {
        a: [ {
            x: 1
        }, {
            y: 3,
            z: 5
        } ]
    }), modifyWithQuery({
        a: [ {
            b: [ 1, 1 ]
        }, {
            b: [ [ 3, 3 ], [ 4, 4 ] ]
        }, {
            b: [ 9, 9 ]
        } ]
    }, {
        "a.b": {
            $near: [ 5, 5 ]
        }
    }, {
        $set: {
            "a.$.b": "k"
        }
    }, {
        a: [ {
            b: [ 1, 1 ]
        }, {
            b: "k"
        }, {
            b: [ 9, 9 ]
        } ]
    }), modifyWithQuery({
        a: [ {
            x: 1
        }, {
            y: 1
        }, {
            x: 1,
            y: 1
        } ]
    }, {
        a: {
            $elemMatch: {
                x: 1,
                y: 1
            }
        }
    }, {
        $set: {
            "a.$.x": 2
        }
    }, {
        a: [ {
            x: 1
        }, {
            y: 1
        }, {
            x: 2,
            y: 1
        } ]
    }), modifyWithQuery({
        a: [ {
            b: [ {
                x: 1
            }, {
                y: 1
            }, {
                x: 1,
                y: 1
            } ]
        } ]
    }, {
        "a.b": {
            $elemMatch: {
                x: 1,
                y: 1
            }
        }
    }, {
        $set: {
            "a.$.b": 3
        }
    }, {
        a: [ {
            b: 3
        } ]
    }), modify({
        a: 1,
        b: 2
    }, {
        $inc: {
            a: 10
        }
    }, {
        a: 11,
        b: 2
    }), modify({
        a: 1,
        b: 2
    }, {
        $inc: {
            c: 10
        }
    }, {
        a: 1,
        b: 2,
        c: 10
    }), exception({
        a: 1
    }, {
        $inc: {
            a: "10"
        }
    }), exception({
        a: 1
    }, {
        $inc: {
            a: !0
        }
    }), exception({
        a: 1
    }, {
        $inc: {
            a: [ 10 ]
        }
    }), exception({
        a: "1"
    }, {
        $inc: {
            a: 10
        }
    }), exception({
        a: [ 1 ]
    }, {
        $inc: {
            a: 10
        }
    }), exception({
        a: {}
    }, {
        $inc: {
            a: 10
        }
    }), exception({
        a: !1
    }, {
        $inc: {
            a: 10
        }
    }), exception({
        a: null
    }, {
        $inc: {
            a: 10
        }
    }), modify({
        a: [ 1, 2 ]
    }, {
        $inc: {
            "a.1": 10
        }
    }, {
        a: [ 1, 12 ]
    }), modify({
        a: [ 1, 2 ]
    }, {
        $inc: {
            "a.2": 10
        }
    }, {
        a: [ 1, 2, 10 ]
    }), modify({
        a: [ 1, 2 ]
    }, {
        $inc: {
            "a.3": 10
        }
    }, {
        a: [ 1, 2, null, 10 ]
    }), modify({
        a: {
            b: 2
        }
    }, {
        $inc: {
            "a.b": 10
        }
    }, {
        a: {
            b: 12
        }
    }), modify({
        a: {
            b: 2
        }
    }, {
        $inc: {
            "a.c": 10
        }
    }, {
        a: {
            b: 2,
            c: 10
        }
    }), exception({}, {
        $inc: {
            _id: 1
        }
    }), modify({
        a: 1,
        b: 2
    }, {
        $set: {
            a: 10
        }
    }, {
        a: 10,
        b: 2
    }), modify({
        a: 1,
        b: 2
    }, {
        $set: {
            c: 10
        }
    }, {
        a: 1,
        b: 2,
        c: 10
    }), modify({
        a: 1,
        b: 2
    }, {
        $set: {
            a: {
                c: 10
            }
        }
    }, {
        a: {
            c: 10
        },
        b: 2
    }), modify({
        a: [ 1, 2 ],
        b: 2
    }, {
        $set: {
            a: [ 3, 4 ]
        }
    }, {
        a: [ 3, 4 ],
        b: 2
    }), modify({
        a: [ 1, 2, 3 ],
        b: 2
    }, {
        $set: {
            "a.1": [ 3, 4 ]
        }
    }, {
        a: [ 1, [ 3, 4 ], 3 ],
        b: 2
    }), modify({
        a: [ 1 ],
        b: 2
    }, {
        $set: {
            "a.1": 9
        }
    }, {
        a: [ 1, 9 ],
        b: 2
    }), modify({
        a: [ 1 ],
        b: 2
    }, {
        $set: {
            "a.2": 9
        }
    }, {
        a: [ 1, null, 9 ],
        b: 2
    }), modify({
        a: {
            b: 1
        }
    }, {
        $set: {
            "a.c": 9
        }
    }, {
        a: {
            b: 1,
            c: 9
        }
    }), modify({}, {
        $set: {
            "x._id": 4
        }
    }, {
        x: {
            _id: 4
        }
    }), exception({}, {
        $set: {
            _id: 4
        }
    }), exception({
        _id: 4
    }, {
        $set: {
            _id: 4
        }
    }), modify({}, {
        $unset: {
            a: 1
        }
    }, {}), modify({
        a: 1
    }, {
        $unset: {
            a: 1
        }
    }, {}), modify({
        a: 1,
        b: 2
    }, {
        $unset: {
            a: 1
        }
    }, {
        b: 2
    }), modify({
        a: 1,
        b: 2
    }, {
        $unset: {
            a: 0
        }
    }, {
        b: 2
    }), modify({
        a: 1,
        b: 2
    }, {
        $unset: {
            a: !1
        }
    }, {
        b: 2
    }), modify({
        a: 1,
        b: 2
    }, {
        $unset: {
            a: null
        }
    }, {
        b: 2
    }), modify({
        a: 1,
        b: 2
    }, {
        $unset: {
            a: [ 1 ]
        }
    }, {
        b: 2
    }), modify({
        a: 1,
        b: 2
    }, {
        $unset: {
            a: {}
        }
    }, {
        b: 2
    }), modify({
        a: {
            b: 2,
            c: 3
        }
    }, {
        $unset: {
            "a.b": 1
        }
    }, {
        a: {
            c: 3
        }
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $unset: {
            "a.1": 1
        }
    }, {
        a: [ 1, null, 3 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $unset: {
            "a.2": 1
        }
    }, {
        a: [ 1, 2, null ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $unset: {
            "a.x": 1
        }
    }, {
        a: [ 1, 2, 3 ]
    }), modify({
        a: {
            b: 1
        }
    }, {
        $unset: {
            "a.b.c.d": 1
        }
    }, {
        a: {
            b: 1
        }
    }), modify({
        a: {
            b: 1
        }
    }, {
        $unset: {
            "a.x.c.d": 1
        }
    }, {
        a: {
            b: 1
        }
    }), modify({
        a: {
            b: {
                c: 1
            }
        }
    }, {
        $unset: {
            "a.b.c": 1
        }
    }, {
        a: {
            b: {}
        }
    }), exception({}, {
        $unset: {
            _id: 1
        }
    }), modify({}, {
        $push: {
            a: 1
        }
    }, {
        a: [ 1 ]
    }), modify({
        a: []
    }, {
        $push: {
            a: 1
        }
    }, {
        a: [ 1 ]
    }), modify({
        a: [ 1 ]
    }, {
        $push: {
            a: 2
        }
    }, {
        a: [ 1, 2 ]
    }), exception({
        a: !0
    }, {
        $push: {
            a: 1
        }
    }), modify({
        a: [ 1 ]
    }, {
        $push: {
            a: [ 2 ]
        }
    }, {
        a: [ 1, [ 2 ] ]
    }), modify({
        a: []
    }, {
        $push: {
            "a.1": 99
        }
    }, {
        a: [ null, [ 99 ] ]
    }), modify({
        a: {}
    }, {
        $push: {
            "a.x": 99
        }
    }, {
        a: {
            x: [ 99 ]
        }
    }), modify({}, {
        $push: {
            a: {
                $each: [ 1, 2, 3 ]
            }
        }
    }, {
        a: [ 1, 2, 3 ]
    }), modify({
        a: []
    }, {
        $push: {
            a: {
                $each: [ 1, 2, 3 ]
            }
        }
    }, {
        a: [ 1, 2, 3 ]
    }), modify({
        a: [ !0 ]
    }, {
        $push: {
            a: {
                $each: [ 1, 2, 3 ]
            }
        }
    }, {
        a: [ !0, 1, 2, 3 ]
    }), exception({}, {
        $push: {
            a: {
                $each: [],
                $slice: 5
            }
        }
    }), modify({
        a: [ !0 ]
    }, {
        $push: {
            a: {
                $each: [ 1, 2, 3 ],
                $slice: -2
            }
        }
    }, {
        a: [ 2, 3 ]
    }), modify({
        a: [ !1, !0 ]
    }, {
        $push: {
            a: {
                $each: [ 1 ],
                $slice: -2
            }
        }
    }, {
        a: [ !0, 1 ]
    }), modify({
        a: [ {
            x: 3
        }, {
            x: 1
        } ]
    }, {
        $push: {
            a: {
                $each: [ {
                    x: 4
                }, {
                    x: 2
                } ],
                $slice: -2,
                $sort: {
                    x: 1
                }
            }
        }
    }, {
        a: [ {
            x: 3
        }, {
            x: 4
        } ]
    }), modify({}, {
        $push: {
            a: {
                $each: [ 1, 2, 3 ],
                $slice: 0
            }
        }
    }, {
        a: []
    }), modify({
        a: [ 1, 2 ]
    }, {
        $push: {
            a: {
                $each: [ 1, 2, 3 ],
                $slice: 0
            }
        }
    }, {
        a: []
    }), modify({}, {
        $pushAll: {
            a: [ 1 ]
        }
    }, {
        a: [ 1 ]
    }), modify({
        a: []
    }, {
        $pushAll: {
            a: [ 1 ]
        }
    }, {
        a: [ 1 ]
    }), modify({
        a: [ 1 ]
    }, {
        $pushAll: {
            a: [ 2 ]
        }
    }, {
        a: [ 1, 2 ]
    }), modify({}, {
        $pushAll: {
            a: [ 1, 2 ]
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: []
    }, {
        $pushAll: {
            a: [ 1, 2 ]
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1 ]
    }, {
        $pushAll: {
            a: [ 2, 3 ]
        }
    }, {
        a: [ 1, 2, 3 ]
    }), modify({}, {
        $pushAll: {
            a: []
        }
    }, {
        a: []
    }), modify({
        a: []
    }, {
        $pushAll: {
            a: []
        }
    }, {
        a: []
    }), modify({
        a: [ 1 ]
    }, {
        $pushAll: {
            a: []
        }
    }, {
        a: [ 1 ]
    }), exception({
        a: !0
    }, {
        $pushAll: {
            a: [ 1 ]
        }
    }), exception({
        a: []
    }, {
        $pushAll: {
            a: 1
        }
    }), modify({
        a: []
    }, {
        $pushAll: {
            "a.1": [ 99 ]
        }
    }, {
        a: [ null, [ 99 ] ]
    }), modify({
        a: []
    }, {
        $pushAll: {
            "a.1": []
        }
    }, {
        a: [ null, [] ]
    }), modify({
        a: {}
    }, {
        $pushAll: {
            "a.x": [ 99 ]
        }
    }, {
        a: {
            x: [ 99 ]
        }
    }), modify({
        a: {}
    }, {
        $pushAll: {
            "a.x": []
        }
    }, {
        a: {
            x: []
        }
    }), modify({}, {
        $addToSet: {
            a: 1
        }
    }, {
        a: [ 1 ]
    }), modify({
        a: []
    }, {
        $addToSet: {
            a: 1
        }
    }, {
        a: [ 1 ]
    }), modify({
        a: [ 1 ]
    }, {
        $addToSet: {
            a: 2
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1, 2 ]
    }, {
        $addToSet: {
            a: 1
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1, 2 ]
    }, {
        $addToSet: {
            a: 2
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1, 2 ]
    }, {
        $addToSet: {
            a: 3
        }
    }, {
        a: [ 1, 2, 3 ]
    }), exception({
        a: !0
    }, {
        $addToSet: {
            a: 1
        }
    }), modify({
        a: [ 1 ]
    }, {
        $addToSet: {
            a: [ 2 ]
        }
    }, {
        a: [ 1, [ 2 ] ]
    }), modify({}, {
        $addToSet: {
            a: {
                x: 1
            }
        }
    }, {
        a: [ {
            x: 1
        } ]
    }), modify({
        a: [ {
            x: 1
        } ]
    }, {
        $addToSet: {
            a: {
                x: 1
            }
        }
    }, {
        a: [ {
            x: 1
        } ]
    }), modify({
        a: [ {
            x: 1
        } ]
    }, {
        $addToSet: {
            a: {
                x: 2
            }
        }
    }, {
        a: [ {
            x: 1
        }, {
            x: 2
        } ]
    }), modify({
        a: [ {
            x: 1,
            y: 2
        } ]
    }, {
        $addToSet: {
            a: {
                x: 1,
                y: 2
            }
        }
    }, {
        a: [ {
            x: 1,
            y: 2
        } ]
    }), modify({
        a: [ {
            x: 1,
            y: 2
        } ]
    }, {
        $addToSet: {
            a: {
                y: 2,
                x: 1
            }
        }
    }, {
        a: [ {
            x: 1,
            y: 2
        }, {
            y: 2,
            x: 1
        } ]
    }), modify({
        a: [ 1, 2 ]
    }, {
        $addToSet: {
            a: {
                $each: [ 3, 1, 4 ]
            }
        }
    }, {
        a: [ 1, 2, 3, 4 ]
    }), modify({
        a: [ 1, 2 ]
    }, {
        $addToSet: {
            a: {
                $each: [ 3, 1, 4 ],
                b: 12
            }
        }
    }, {
        a: [ 1, 2, 3, 4 ]
    }), modify({
        a: [ 1, 2 ]
    }, {
        $addToSet: {
            a: {
                b: 12,
                $each: [ 3, 1, 4 ]
            }
        }
    }, {
        a: [ 1, 2, {
            b: 12,
            $each: [ 3, 1, 4 ]
        } ]
    }), modify({}, {
        $addToSet: {
            a: {
                $each: []
            }
        }
    }, {
        a: []
    }), modify({}, {
        $addToSet: {
            a: {
                $each: [ 1 ]
            }
        }
    }, {
        a: [ 1 ]
    }), modify({
        a: []
    }, {
        $addToSet: {
            "a.1": 99
        }
    }, {
        a: [ null, [ 99 ] ]
    }), modify({
        a: {}
    }, {
        $addToSet: {
            "a.x": 99
        }
    }, {
        a: {
            x: [ 99 ]
        }
    }), modify({}, {
        $pop: {
            a: 1
        }
    }, {}), modify({}, {
        $pop: {
            a: -1
        }
    }, {}), modify({
        a: []
    }, {
        $pop: {
            a: 1
        }
    }, {
        a: []
    }), modify({
        a: []
    }, {
        $pop: {
            a: -1
        }
    }, {
        a: []
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pop: {
            a: 1
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pop: {
            a: 10
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pop: {
            a: .001
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pop: {
            a: 0
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pop: {
            a: "stuff"
        }
    }, {
        a: [ 1, 2 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pop: {
            a: -1
        }
    }, {
        a: [ 2, 3 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pop: {
            a: -10
        }
    }, {
        a: [ 2, 3 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pop: {
            a: -.001
        }
    }, {
        a: [ 2, 3 ]
    }), exception({
        a: !0
    }, {
        $pop: {
            a: 1
        }
    }), exception({
        a: !0
    }, {
        $pop: {
            a: -1
        }
    }), modify({
        a: []
    }, {
        $pop: {
            "a.1": 1
        }
    }, {
        a: []
    }), modify({
        a: [ 1, [ 2, 3 ], 4 ]
    }, {
        $pop: {
            "a.1": 1
        }
    }, {
        a: [ 1, [ 2 ], 4 ]
    }), modify({
        a: {}
    }, {
        $pop: {
            "a.x": 1
        }
    }, {
        a: {}
    }), modify({
        a: {
            x: [ 2, 3 ]
        }
    }, {
        $pop: {
            "a.x": 1
        }
    }, {
        a: {
            x: [ 2 ]
        }
    }), modify({}, {
        $pull: {
            a: 1
        }
    }, {}), modify({}, {
        $pull: {
            "a.x": 1
        }
    }, {}), modify({
        a: {}
    }, {
        $pull: {
            "a.x": 1
        }
    }, {
        a: {}
    }), exception({
        a: !0
    }, {
        $pull: {
            a: 1
        }
    }), modify({
        a: [ 2, 1, 2 ]
    }, {
        $pull: {
            a: 1
        }
    }, {
        a: [ 2, 2 ]
    }), modify({
        a: [ 2, 1, 2 ]
    }, {
        $pull: {
            a: 2
        }
    }, {
        a: [ 1 ]
    }), modify({
        a: [ 2, 1, 2 ]
    }, {
        $pull: {
            a: 3
        }
    }, {
        a: [ 2, 1, 2 ]
    }), modify({
        a: []
    }, {
        $pull: {
            a: 3
        }
    }, {
        a: []
    }), modify({
        a: [ [ 2 ], [ 2, 1 ], [ 3 ] ]
    }, {
        $pull: {
            a: [ 2, 1 ]
        }
    }, {
        a: [ [ 2 ], [ 3 ] ]
    }), modify({
        a: [ {
            b: 1,
            c: 2
        }, {
            b: 2,
            c: 2
        } ]
    }, {
        $pull: {
            a: {
                b: 1
            }
        }
    }, {
        a: [ {
            b: 2,
            c: 2
        } ]
    }), modify({
        a: [ {
            b: 1,
            c: 2
        }, {
            b: 2,
            c: 2
        } ]
    }, {
        $pull: {
            a: {
                c: 2
            }
        }
    }, {
        a: []
    }), modify({}, {
        $pullAll: {
            a: [ 1 ]
        }
    }, {}), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pullAll: {
            a: []
        }
    }, {
        a: [ 1, 2, 3 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pullAll: {
            a: [ 2 ]
        }
    }, {
        a: [ 1, 3 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pullAll: {
            a: [ 2, 1 ]
        }
    }, {
        a: [ 3 ]
    }), modify({
        a: [ 1, 2, 3 ]
    }, {
        $pullAll: {
            a: [ 1, 2 ]
        }
    }, {
        a: [ 3 ]
    }), modify({}, {
        $pullAll: {
            "a.b.c": [ 2 ]
        }
    }, {}), exception({
        a: !0
    }, {
        $pullAll: {
            a: [ 1 ]
        }
    }), exception({
        a: [ 1, 2, 3 ]
    }, {
        $pullAll: {
            a: 1
        }
    }), modify({
        x: [ {
            a: 1
        }, {
            a: 1,
            b: 2
        } ]
    }, {
        $pullAll: {
            x: [ {
                a: 1
            } ]
        }
    }, {
        x: [ {
            a: 1,
            b: 2
        } ]
    }), modify({}, {
        $rename: {
            a: "b"
        }
    }, {}), modify({
        a: [ 12 ]
    }, {
        $rename: {
            a: "b"
        }
    }, {
        b: [ 12 ]
    }), modify({
        a: {
            b: 12
        }
    }, {
        $rename: {
            a: "c"
        }
    }, {
        c: {
            b: 12
        }
    }), modify({
        a: {
            b: 12
        }
    }, {
        $rename: {
            "a.b": "a.c"
        }
    }, {
        a: {
            c: 12
        }
    }), modify({
        a: {
            b: 12
        }
    }, {
        $rename: {
            "a.b": "x"
        }
    }, {
        a: {},
        x: 12
    }), modify({
        a: {
            b: 12
        }
    }, {
        $rename: {
            "a.b": "q.r"
        }
    }, {
        a: {},
        q: {
            r: 12
        }
    }), modify({
        a: {
            b: 12
        }
    }, {
        $rename: {
            "a.b": "q.2.r"
        }
    }, {
        a: {},
        q: {
            2: {
                r: 12
            }
        }
    }), modify({
        a: {
            b: 12
        },
        q: {}
    }, {
        $rename: {
            "a.b": "q.2.r"
        }
    }, {
        a: {},
        q: {
            2: {
                r: 12
            }
        }
    }), exception({
        a: {
            b: 12
        },
        q: []
    }, {
        $rename: {
            "a.b": "q.2"
        }
    }), exception({
        a: {
            b: 12
        },
        q: []
    }, {
        $rename: {
            "a.b": "q.2.r"
        }
    }), exception({}, {
        $rename: {
            a: "a"
        }
    }), exception({}, {
        $rename: {
            "a.b": "a.b"
        }
    }), modify({
        a: 12,
        b: 13
    }, {
        $rename: {
            a: "b"
        }
    }, {
        b: 12
    });
}), Tinytest.add("minimongo - observe ordered", function(test) {
    var handle, operations = [], cbs = log_callbacks(operations), c = new LocalCollection();
    handle = c.find({}, {
        sort: {
            a: 1
        }
    }).observe(cbs), test.isTrue(handle.collection === c), c.insert({
        _id: "foo",
        a: 1
    }), test.equal(operations.shift(), [ "added", {
        a: 1
    }, 0, null ]), c.update({
        a: 1
    }, {
        $set: {
            a: 2
        }
    }), test.equal(operations.shift(), [ "changed", {
        a: 2
    }, 0, {
        a: 1
    } ]), c.insert({
        a: 10
    }), test.equal(operations.shift(), [ "added", {
        a: 10
    }, 1, null ]), c.update({}, {
        $inc: {
            a: 1
        }
    }, {
        multi: !0
    }), test.equal(operations.shift(), [ "changed", {
        a: 3
    }, 0, {
        a: 2
    } ]), test.equal(operations.shift(), [ "changed", {
        a: 11
    }, 1, {
        a: 10
    } ]), c.update({
        a: 11
    }, {
        a: 1
    }), test.equal(operations.shift(), [ "changed", {
        a: 1
    }, 1, {
        a: 11
    } ]), test.equal(operations.shift(), [ "moved", {
        a: 1
    }, 1, 0, "foo" ]), c.remove({
        a: 2
    }), test.equal(operations.shift(), void 0), c.remove({
        a: 3
    }), test.equal(operations.shift(), [ "removed", "foo", 1, {
        a: 3
    } ]), handle.stop();
    var idA2 = Random.id();
    c.insert({
        _id: idA2,
        a: 2
    }), test.equal(operations.shift(), void 0), handle = c.find({}, {
        sort: {
            a: -1
        }
    }).observe(cbs), test.equal(operations.shift(), [ "added", {
        a: 2
    }, 0, null ]), test.equal(operations.shift(), [ "added", {
        a: 1
    }, 1, null ]), handle.stop(), handle = c.find({}, {
        sort: {
            a: -1
        }
    }).observe(_.extend({
        _suppress_initial: !0
    }, cbs)), test.equal(operations.shift(), void 0), c.insert({
        a: 100
    }), test.equal(operations.shift(), [ "added", {
        a: 100
    }, 0, idA2 ]), handle.stop(), c.remove({}), handle = c.find({}, {
        sort: {
            a: 1
        },
        skip: 1,
        limit: 2
    }).observe(cbs), test.equal(operations.shift(), void 0), c.insert({
        a: 1
    }), test.equal(operations.shift(), void 0), c.insert({
        _id: "foo",
        a: 2
    }), test.equal(operations.shift(), [ "added", {
        a: 2
    }, 0, null ]), c.insert({
        a: 3
    }), test.equal(operations.shift(), [ "added", {
        a: 3
    }, 1, null ]), c.insert({
        a: 4
    }), test.equal(operations.shift(), void 0), c.update({
        a: 1
    }, {
        a: 0
    }), test.equal(operations.shift(), void 0), c.update({
        a: 0
    }, {
        a: 5
    }), test.equal(operations.shift(), [ "removed", "foo", 0, {
        a: 2
    } ]), test.equal(operations.shift(), [ "added", {
        a: 4
    }, 1, null ]), c.update({
        a: 3
    }, {
        a: 3.5
    }), test.equal(operations.shift(), [ "changed", {
        a: 3.5
    }, 0, {
        a: 3
    } ]), handle.stop(), c.remove({}), c.insert({
        a: 1
    }), c.insert({
        _id: "two",
        a: 2
    }), c.insert({
        a: 3
    }), handle = c.find({}, {
        sort: {
            a: 1
        },
        limit: 2
    }).observe(cbs), test.equal(operations.shift(), [ "added", {
        a: 1
    }, 0, null ]), test.equal(operations.shift(), [ "added", {
        a: 2
    }, 1, null ]), test.equal(operations.shift(), void 0), c.remove({
        a: 2
    }), test.equal(operations.shift(), [ "removed", "two", 1, {
        a: 2
    } ]), test.equal(operations.shift(), [ "added", {
        a: 3
    }, 1, null ]), test.equal(operations.shift(), void 0), handle.stop(), c.remove({}), 
    handle = c.find({}, {
        sort: {
            a: 1
        }
    }).observe(_.extend(cbs, {
        _no_indices: !0
    })), c.insert({
        _id: "foo",
        a: 1
    }), test.equal(operations.shift(), [ "added", {
        a: 1
    }, -1, null ]), c.update({
        a: 1
    }, {
        $set: {
            a: 2
        }
    }), test.equal(operations.shift(), [ "changed", {
        a: 2
    }, -1, {
        a: 1
    } ]), c.insert({
        a: 10
    }), test.equal(operations.shift(), [ "added", {
        a: 10
    }, -1, null ]), c.update({}, {
        $inc: {
            a: 1
        }
    }, {
        multi: !0
    }), test.equal(operations.shift(), [ "changed", {
        a: 3
    }, -1, {
        a: 2
    } ]), test.equal(operations.shift(), [ "changed", {
        a: 11
    }, -1, {
        a: 10
    } ]), c.update({
        a: 11
    }, {
        a: 1
    }), test.equal(operations.shift(), [ "changed", {
        a: 1
    }, -1, {
        a: 11
    } ]), test.equal(operations.shift(), [ "moved", {
        a: 1
    }, -1, -1, "foo" ]), c.remove({
        a: 2
    }), test.equal(operations.shift(), void 0), c.remove({
        a: 3
    }), test.equal(operations.shift(), [ "removed", "foo", -1, {
        a: 3
    } ]), handle.stop();
}), _.each([ !0, !1 ], function(ordered) {
    Tinytest.add("minimongo - observe ordered: " + ordered, function(test) {
        var c = new LocalCollection(), ev = "", makecb = function(tag) {
            var ret = {};
            return _.each([ "added", "changed", "removed" ], function(fn) {
                var fnName = ordered ? fn + "At" : fn;
                ret[fnName] = function(doc) {
                    ev = ev + fn.substr(0, 1) + tag + doc._id + "_";
                };
            }), ret;
        }, expect = function(x) {
            test.equal(ev, x), ev = "";
        };
        c.insert({
            _id: 1,
            name: "strawberry",
            tags: [ "fruit", "red", "squishy" ]
        }), c.insert({
            _id: 2,
            name: "apple",
            tags: [ "fruit", "red", "hard" ]
        }), c.insert({
            _id: 3,
            name: "rose",
            tags: [ "flower", "red", "squishy" ]
        });
        var handle = c.find({
            tags: "flower"
        }).observe(makecb("a"));
        expect("aa3_"), c.update({
            name: "rose"
        }, {
            $set: {
                tags: [ "bloom", "red", "squishy" ]
            }
        }), expect("ra3_"), c.update({
            name: "rose"
        }, {
            $set: {
                tags: [ "flower", "red", "squishy" ]
            }
        }), expect("aa3_"), c.update({
            name: "rose"
        }, {
            $set: {
                food: !1
            }
        }), expect("ca3_"), c.remove({}), expect("ra3_"), c.insert({
            _id: 4,
            name: "daisy",
            tags: [ "flower" ]
        }), expect("aa4_"), handle.stop(), c.insert({
            _id: 5,
            name: "iris",
            tags: [ "flower" ]
        }), expect(""), handle = c.find(4).observe(makecb("b")), expect("ab4_"), c.update(4, {
            $set: {
                eek: 5
            }
        }), expect("cb4_"), handle.stop(), handle = c.find({
            tags: "flower"
        }, {
            reactive: !1
        }).observe(makecb("c")), expect("ac4_ac5_"), c.insert({
            _id: 6,
            name: "river",
            tags: [ "flower" ]
        }), expect(""), handle.stop();
    });
}), Tinytest.add("minimongo - diff changes ordering", function(test) {
    var makeDocs = function(ids) {
        return _.map(ids, function(id) {
            return {
                _id: id
            };
        });
    }, testMutation = function(a, b) {
        var aa = makeDocs(a), bb = makeDocs(b), aaCopy = EJSON.clone(aa);
        LocalCollection._diffQueryOrderedChanges(aa, bb, {
            addedBefore: function(id, doc, before) {
                if (null === before) return void aaCopy.push(_.extend({
                    _id: id
                }, doc));
                for (var i = 0; i < aaCopy.length; i++) if (aaCopy[i]._id === before) return void aaCopy.splice(i, 0, _.extend({
                    _id: id
                }, doc));
            },
            movedBefore: function(id, before) {
                for (var found, i = 0; i < aaCopy.length; i++) aaCopy[i]._id === id && (found = aaCopy[i], 
                aaCopy.splice(i, 1));
                if (null === before) return void aaCopy.push(_.extend({
                    _id: id
                }, found));
                for (i = 0; i < aaCopy.length; i++) if (aaCopy[i]._id === before) return void aaCopy.splice(i, 0, _.extend({
                    _id: id
                }, found));
            },
            removed: function(id) {
                for (var found, i = 0; i < aaCopy.length; i++) aaCopy[i]._id === id && (found = aaCopy[i], 
                aaCopy.splice(i, 1));
            }
        }), test.equal(aaCopy, bb);
    }, testBothWays = function(a, b) {
        testMutation(a, b), testMutation(b, a);
    };
    testBothWays([ "a", "b", "c" ], [ "c", "b", "a" ]), testBothWays([ "a", "b", "c" ], []), 
    testBothWays([ "a", "b", "c" ], [ "e", "f" ]), testBothWays([ "a", "b", "c", "d" ], [ "c", "b", "a" ]), 
    testBothWays([ "A", "B", "C", "D", "E", "F", "G", "H", "I" ], [ "A", "B", "F", "G", "C", "D", "I", "L", "M", "N", "H" ]), 
    testBothWays([ "A", "B", "C", "D", "E", "F", "G", "H", "I" ], [ "A", "B", "C", "D", "F", "G", "H", "E", "I" ]);
}), Tinytest.add("minimongo - diff", function(test) {
    var diffTest = function(origLen, newOldIdx) {
        for (var oldResults = new Array(origLen), i = 1; origLen >= i; i++) oldResults[i - 1] = {
            _id: i
        };
        var newResults = _.map(newOldIdx, function(n) {
            var doc = {
                _id: Math.abs(n)
            };
            return 0 > n && (doc.changed = !0), doc;
        }), find = function(arr, id) {
            for (var i = 0; i < arr.length; i++) if (EJSON.equals(arr[i]._id, id)) return i;
            return -1;
        }, results = _.clone(oldResults), observer = {
            addedBefore: function(id, fields, before) {
                var before_idx;
                before_idx = null === before ? results.length : find(results, before);
                var doc = _.extend({
                    _id: id
                }, fields);
                test.isFalse(0 > before_idx || before_idx > results.length), results.splice(before_idx, 0, doc);
            },
            removed: function(id) {
                var at_idx = find(results, id);
                test.isFalse(0 > at_idx || at_idx >= results.length), results.splice(at_idx, 1);
            },
            changed: function(id, fields) {
                var at_idx = find(results, id), oldDoc = results[at_idx], doc = EJSON.clone(oldDoc);
                LocalCollection._applyChanges(doc, fields), test.isFalse(0 > at_idx || at_idx >= results.length), 
                test.equal(doc._id, oldDoc._id), results[at_idx] = doc;
            },
            movedBefore: function(id, before) {
                var new_idx, old_idx = find(results, id);
                new_idx = null === before ? results.length : find(results, before), new_idx > old_idx && new_idx--, 
                test.isFalse(0 > old_idx || old_idx >= results.length), test.isFalse(0 > new_idx || new_idx >= results.length), 
                results.splice(new_idx, 0, results.splice(old_idx, 1)[0]);
            }
        };
        LocalCollection._diffQueryOrderedChanges(oldResults, newResults, observer), test.equal(results, newResults);
    };
    diffTest(5, [ 5, 1, 2, 3, 4 ]), diffTest(0, [ 1, 2, 3, 4 ]), diffTest(4, []), diffTest(7, [ 4, 5, 6, 7, 1, 2, 3 ]), 
    diffTest(7, [ 5, 6, 7, 1, 2, 3, 4 ]), diffTest(10, [ 7, 4, 11, 6, 12, 1, 5 ]), diffTest(3, [ 3, 2, 1 ]), 
    diffTest(10, [ 2, 7, 4, 6, 11, 3, 8, 9 ]), diffTest(0, []), diffTest(1, []), diffTest(0, [ 1 ]), 
    diffTest(1, [ 1 ]), diffTest(5, [ 1, 2, 3, 4, 5 ]), diffTest(5, [ -5, -1, 2, -3, 4 ]), 
    diffTest(7, [ -4, -5, 6, 7, -1, 2, 3 ]), diffTest(7, [ 5, 6, -7, 1, 2, -3, 4 ]), 
    diffTest(10, [ 7, -4, 11, 6, 12, -1, 5 ]), diffTest(3, [ -3, -2, -1 ]), diffTest(10, [ -2, 7, 4, 6, 11, -3, -8, 9 ]);
}), Tinytest.add("minimongo - saveOriginals", function(test) {
    var count, c = new LocalCollection();
    c.insert({
        _id: "foo",
        x: "untouched"
    }), c.insert({
        _id: "bar",
        x: "updateme"
    }), c.insert({
        _id: "baz",
        x: "updateme"
    }), c.insert({
        _id: "quux",
        y: "removeme"
    }), c.insert({
        _id: "whoa",
        y: "removeme"
    }), c.saveOriginals(), c.insert({
        _id: "hooray",
        z: "insertme"
    }), c.remove({
        y: "removeme"
    }), count = c.update({
        x: "updateme"
    }, {
        $set: {
            z: 5
        }
    }, {
        multi: !0
    }), c.update("bar", {
        $set: {
            k: 7
        }
    }), test.equal(count, 2);
    var originals = c.retrieveOriginals(), affected = [ "bar", "baz", "quux", "whoa", "hooray" ];
    test.equal(originals.size(), _.size(affected)), _.each(affected, function(id) {
        test.isTrue(originals.has(id));
    }), test.equal(originals.get("bar"), {
        _id: "bar",
        x: "updateme"
    }), test.equal(originals.get("baz"), {
        _id: "baz",
        x: "updateme"
    }), test.equal(originals.get("quux"), {
        _id: "quux",
        y: "removeme"
    }), test.equal(originals.get("whoa"), {
        _id: "whoa",
        y: "removeme"
    }), test.equal(originals.get("hooray"), void 0), test.equal(c.find().count(), 4), 
    test.equal(c.findOne("foo"), {
        _id: "foo",
        x: "untouched"
    }), test.equal(c.findOne("bar"), {
        _id: "bar",
        x: "updateme",
        z: 5,
        k: 7
    }), test.equal(c.findOne("baz"), {
        _id: "baz",
        x: "updateme",
        z: 5
    }), test.equal(c.findOne("hooray"), {
        _id: "hooray",
        z: "insertme"
    }), c.saveOriginals(), originals = c.retrieveOriginals(), test.isTrue(originals), 
    test.isTrue(originals.empty()), c.saveOriginals(), c.insert({
        _id: "temp",
        q: 8
    }), c.remove("temp"), originals = c.retrieveOriginals(), test.equal(originals.size(), 1), 
    test.isTrue(originals.has("temp")), test.equal(originals.get("temp"), void 0);
}), Tinytest.add("minimongo - saveOriginals errors", function(test) {
    var c = new LocalCollection();
    test["throws"](function() {
        c.retrieveOriginals();
    }), c.saveOriginals(), test["throws"](function() {
        c.saveOriginals();
    });
}), Tinytest.add("minimongo - objectid transformation", function(test) {
    var testId = function(item) {
        test.equal(item, LocalCollection._idParse(LocalCollection._idStringify(item)));
    }, randomOid = new LocalCollection._ObjectID();
    testId(randomOid), testId("FOO"), testId("ffffffffffff"), testId("0987654321abcdef09876543"), 
    testId(new LocalCollection._ObjectID()), testId("--a string"), test.equal("ffffffffffff", LocalCollection._idParse(LocalCollection._idStringify("ffffffffffff")));
}), Tinytest.add("minimongo - objectid", function(test) {
    var randomOid = new LocalCollection._ObjectID(), anotherRandomOid = new LocalCollection._ObjectID();
    test.notEqual(randomOid, anotherRandomOid), test["throws"](function() {
        new LocalCollection._ObjectID("qqqqqqqqqqqqqqqqqqqqqqqq");
    }), test["throws"](function() {
        new LocalCollection._ObjectID("ABCDEF");
    }), test.equal(randomOid, new LocalCollection._ObjectID(randomOid.valueOf()));
}), Tinytest.add("minimongo - pause", function(test) {
    var operations = [], cbs = log_callbacks(operations), c = new LocalCollection(), h = c.find({}).observe(cbs);
    c.insert({
        _id: 1,
        a: 1
    }), test.equal(operations.shift(), [ "added", {
        a: 1
    }, 0, null ]), c.pauseObservers(), c.remove({
        _id: 1
    }), test.length(operations, 0), c.insert({
        _id: 1,
        a: 1
    }), test.length(operations, 0), c.resumeObservers(), test.length(operations, 0), 
    c.pauseObservers(), c.update({
        _id: 1
    }, {
        a: 2
    }), c.update({
        _id: 1
    }, {
        a: 3
    }), c.resumeObservers(), test.equal(operations.shift(), [ "changed", {
        a: 3
    }, 0, {
        a: 1
    } ]), test.length(operations, 0), c.pauseObservers(), test.equal(c.remove({}), 1), 
    test.length(operations, 0), c.resumeObservers(), test.equal(operations.shift(), [ "removed", 1, 0, {
        a: 3
    } ]), test.length(operations, 0), h.stop();
}), Tinytest.add("minimongo - ids matched by selector", function(test) {
    var check = function(selector, ids) {
        var idsFromSelector = LocalCollection._idsMatchedBySelector(selector);
        test.equal(idsFromSelector, ids);
    };
    check("foo", [ "foo" ]), check({
        _id: "foo"
    }, [ "foo" ]);
    var oid1 = new LocalCollection._ObjectID();
    check(oid1, [ oid1 ]), check({
        _id: oid1
    }, [ oid1 ]), check({
        _id: "foo",
        x: 42
    }, [ "foo" ]), check({}, null), check({
        _id: {
            $in: [ "foo", oid1 ]
        }
    }, [ "foo", oid1 ]), check({
        _id: {
            $ne: "foo"
        }
    }, null), check({
        $and: [ "foo" ]
    }, [ "foo" ]), check({
        $and: [ {
            x: 42
        }, {
            _id: oid1
        } ]
    }, [ oid1 ]), check({
        $and: [ {
            x: 42
        }, {
            _id: {
                $in: [ oid1 ]
            }
        } ]
    }, [ oid1 ]);
}), Tinytest.add("minimongo - reactive stop", function(test) {
    var coll = new LocalCollection();
    coll.insert({
        _id: "A"
    }), coll.insert({
        _id: "B"
    }), coll.insert({
        _id: "C"
    });
    var x, y, addBefore = function(str, newChar, before) {
        var idx = str.indexOf(before);
        return -1 === idx ? str + newChar : str.slice(0, idx) + newChar + str.slice(idx);
    }, sortOrder = ReactiveVar(1), c = Tracker.autorun(function() {
        var q = coll.find({}, {
            sort: {
                _id: sortOrder.get()
            }
        });
        x = "", q.observe({
            addedAt: function(doc, atIndex, before) {
                x = addBefore(x, doc._id, before);
            }
        }), y = "", q.observeChanges({
            addedBefore: function(id, fields, before) {
                y = addBefore(y, id, before);
            }
        });
    });
    test.equal(x, "ABC"), test.equal(y, "ABC"), sortOrder.set(-1), test.equal(x, "ABC"), 
    test.equal(y, "ABC"), Tracker.flush(), test.equal(x, "CBA"), test.equal(y, "CBA"), 
    coll.insert({
        _id: "D"
    }), coll.insert({
        _id: "E"
    }), test.equal(x, "EDCBA"), test.equal(y, "EDCBA"), c.stop(), coll.insert({
        _id: "F"
    }), test.equal(x, "EDCBA"), test.equal(y, "EDCBA");
}), Tinytest.add("minimongo - immediate invalidate", function() {
    var coll = new LocalCollection();
    coll.insert({
        _id: "A"
    });
    var c = Tracker.autorun(function() {
        coll.findOne("A"), coll.findOne("A");
    });
    coll.update("A", {
        $set: {
            x: 42
        }
    }), c.stop();
}), Tinytest.add("minimongo - count on cursor with limit", function(test) {
    var count, coll = new LocalCollection();
    coll.insert({
        _id: "A"
    }), coll.insert({
        _id: "B"
    }), coll.insert({
        _id: "C"
    }), coll.insert({
        _id: "D"
    });
    var c = Tracker.autorun(function() {
        var cursor = coll.find({
            _id: {
                $exists: !0
            }
        }, {
            sort: {
                _id: 1
            },
            limit: 3
        });
        count = cursor.count();
    });
    test.equal(count, 3), coll.remove("A"), Tracker.flush(), test.equal(count, 3), coll.remove("B"), 
    Tracker.flush(), test.equal(count, 2), coll.insert({
        _id: "A"
    }), Tracker.flush(), test.equal(count, 3), coll.insert({
        _id: "B"
    }), Tracker.flush(), test.equal(count, 3), c.stop();
}), Tinytest.add("minimongo - reactive count with cached cursor", function(test) {
    var firstAutorunCount, secondAutorunCount, coll = new LocalCollection(), cursor = coll.find({});
    Tracker.autorun(function() {
        firstAutorunCount = cursor.count();
    }), Tracker.autorun(function() {
        secondAutorunCount = coll.find({}).count();
    }), test.equal(firstAutorunCount, 0), test.equal(secondAutorunCount, 0), coll.insert({
        i: 1
    }), coll.insert({
        i: 2
    }), coll.insert({
        i: 3
    }), Tracker.flush(), test.equal(firstAutorunCount, 3), test.equal(secondAutorunCount, 3);
}), Tinytest.add("minimongo - $near operator tests", function(test) {
    function distance(a, b) {
        var x = a[0] - b[0], y = a[1] - b[1];
        return Math.sqrt(x * x + y * y);
    }
    var coll = new LocalCollection();
    coll.insert({
        rest: {
            loc: [ 2, 3 ]
        }
    }), coll.insert({
        rest: {
            loc: [ -3, 3 ]
        }
    }), coll.insert({
        rest: {
            loc: [ 5, 5 ]
        }
    }), test.equal(coll.find({
        "rest.loc": {
            $near: [ 0, 0 ],
            $maxDistance: 30
        }
    }).count(), 3), test.equal(coll.find({
        "rest.loc": {
            $near: [ 0, 0 ],
            $maxDistance: 4
        }
    }).count(), 1);
    var points = coll.find({
        "rest.loc": {
            $near: [ 0, 0 ],
            $maxDistance: 6
        }
    }).fetch();
    _.each(points, function(point, i, points) {
        test.isTrue(!i || distance([ 0, 0 ], point.rest.loc) >= distance([ 0, 0 ], points[i - 1].rest.loc));
    }), coll = new LocalCollection();
    var data = [ {
        category: "BURGLARY",
        descript: "BURGLARY OF STORE, FORCIBLE ENTRY",
        address: "100 Block of 10TH ST",
        location: {
            type: "Point",
            coordinates: [ -122.415449723856, 37.7749518087273 ]
        }
    }, {
        category: "WEAPON LAWS",
        descript: "POSS OF PROHIBITED WEAPON",
        address: "900 Block of MINNA ST",
        location: {
            type: "Point",
            coordinates: [ -122.415386041221, 37.7747879744156 ]
        }
    }, {
        category: "LARCENY/THEFT",
        descript: "GRAND THEFT OF PROPERTY",
        address: "900 Block of MINNA ST",
        location: {
            type: "Point",
            coordinates: [ -122.41538270191, 37.774683628213 ]
        }
    }, {
        category: "LARCENY/THEFT",
        descript: "PETTY THEFT FROM LOCKED AUTO",
        address: "900 Block of MINNA ST",
        location: {
            type: "Point",
            coordinates: [ -122.415396041221, 37.7747879744156 ]
        }
    }, {
        category: "OTHER OFFENSES",
        descript: "POSSESSION OF BURGLARY TOOLS",
        address: "900 Block of MINNA ST",
        location: {
            type: "Point",
            coordinates: [ -122.415386041221, 37.7747879734156 ]
        }
    } ];
    _.each(data, function(x, i) {
        coll.insert(_.extend(x, {
            x: i
        }));
    });
    var close15 = coll.find({
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [ -122.4154282, 37.7746115 ]
                },
                $maxDistance: 15
            }
        }
    }).fetch();
    test.length(close15, 1), test.equal(close15[0].descript, "GRAND THEFT OF PROPERTY");
    var close20 = coll.find({
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [ -122.4154282, 37.7746115 ]
                },
                $maxDistance: 20
            }
        }
    }).fetch();
    test.length(close20, 4), test.equal(close20[0].descript, "GRAND THEFT OF PROPERTY"), 
    test.equal(close20[1].descript, "PETTY THEFT FROM LOCKED AUTO"), test.equal(close20[2].descript, "POSSESSION OF BURGLARY TOOLS"), 
    test.equal(close20[3].descript, "POSS OF PROHIBITED WEAPON"), test["throws"](function() {
        coll.find({
            location: {
                $not: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [ -122.4154282, 37.7746115 ]
                        },
                        $maxDistance: 20
                    }
                }
            }
        });
    }), test["throws"](function() {
        coll.find({
            $and: [ {
                location: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [ -122.4154282, 37.7746115 ]
                        },
                        $maxDistance: 20
                    }
                }
            }, {
                x: 0
            } ]
        });
    }), test["throws"](function() {
        coll.find({
            $or: [ {
                location: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [ -122.4154282, 37.7746115 ]
                        },
                        $maxDistance: 20
                    }
                }
            }, {
                x: 0
            } ]
        });
    }), test["throws"](function() {
        coll.find({
            $nor: [ {
                location: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [ -122.4154282, 37.7746115 ]
                        },
                        $maxDistance: 1
                    }
                }
            }, {
                x: 0
            } ]
        });
    }), test["throws"](function() {
        coll.find({
            $and: [ {
                $and: [ {
                    location: {
                        $near: {
                            $geometry: {
                                type: "Point",
                                coordinates: [ -122.4154282, 37.7746115 ]
                            },
                            $maxDistance: 1
                        }
                    }
                } ]
            } ]
        });
    }), coll = new LocalCollection(), coll.insert({
        _id: "x",
        k: 9,
        a: [ {
            b: [ [ 100, 100 ], [ 1, 1 ] ]
        }, {
            b: [ 150, 150 ]
        } ]
    }), coll.insert({
        _id: "y",
        k: 9,
        a: {
            b: [ 5, 5 ]
        }
    });
    var testNear = function(near, md, expected) {
        test.equal(_.pluck(coll.find({
            "a.b": {
                $near: near,
                $maxDistance: md
            }
        }).fetch(), "_id"), expected);
    };
    testNear([ 149, 149 ], 4, [ "x" ]), testNear([ 149, 149 ], 1e3, [ "x", "y" ]), testNear([ 2, 2 ], 1e3, [ "x", "y" ]), 
    test.equal(_.pluck(coll.find({
        "a.b": {
            $near: [ 1, 1 ]
        }
    }, {
        sort: {
            k: 1
        }
    }).fetch(), "_id"), [ "x", "y" ]), test.equal(_.pluck(coll.find({
        "a.b": {
            $near: [ 5, 5 ]
        }
    }, {
        sort: {
            k: 1
        }
    }).fetch(), "_id"), [ "y", "x" ]);
    var operations = [], cbs = log_callbacks(operations), handle = coll.find({
        "a.b": {
            $near: [ 7, 7 ]
        }
    }).observe(cbs);
    test.length(operations, 2), test.equal(operations.shift(), [ "added", {
        k: 9,
        a: {
            b: [ 5, 5 ]
        }
    }, 0, null ]), test.equal(operations.shift(), [ "added", {
        k: 9,
        a: [ {
            b: [ [ 100, 100 ], [ 1, 1 ] ]
        }, {
            b: [ 150, 150 ]
        } ]
    }, 1, null ]), coll.insert({
        a: {
            b: [ 3, 3 ]
        }
    }), test.length(operations, 1), test.equal(operations.shift(), [ "added", {
        a: {
            b: [ 3, 3 ]
        }
    }, 1, "x" ]), handle.stop();
}), Tinytest.add("minimongo - fetch in observe", function(test) {
    var coll = new LocalCollection(), callbackInvoked = !1, observe = coll.find().observeChanges({
        added: function(id, fields) {
            callbackInvoked = !0, test.equal(fields, {
                foo: 1
            });
            var doc = coll.findOne({
                foo: 1
            });
            test.isTrue(doc), test.equal(doc.foo, 1);
        }
    });
    test.isFalse(callbackInvoked);
    var computation = Tracker.autorun(function(computation) {
        computation.firstRun && coll.insert({
            foo: 1
        });
    });
    test.isTrue(callbackInvoked), observe.stop(), computation.stop();
}), Tinytest.add("minimongo - fine-grained reactivity of observe with fields projection", function(test) {
    var X = new LocalCollection(), id = "asdf";
    X.insert({
        _id: id,
        foo: {
            bar: 123
        }
    });
    var callbackInvoked = !1, obs = X.find(id, {
        fields: {
            "foo.bar": 1
        }
    }).observeChanges({
        changed: function() {
            callbackInvoked = !0;
        }
    });
    test.isFalse(callbackInvoked), X.update(id, {
        $set: {
            "foo.baz": 456
        }
    }), test.isFalse(callbackInvoked), obs.stop();
}), Tinytest.add("minimongo - fine-grained reactivity of query with fields projection", function(test) {
    var X = new LocalCollection(), id = "asdf";
    X.insert({
        _id: id,
        foo: {
            bar: 123
        }
    });
    var callbackInvoked = !1, computation = Tracker.autorun(function() {
        return callbackInvoked = !0, X.findOne(id, {
            fields: {
                "foo.bar": 1
            }
        });
    });
    test.isTrue(callbackInvoked), callbackInvoked = !1, X.update(id, {
        $set: {
            "foo.baz": 456
        }
    }), test.isFalse(callbackInvoked), X.update(id, {
        $set: {
            "foo.bar": 124
        }
    }), Tracker.flush(), test.isTrue(callbackInvoked), computation.stop();
}), running = !0, totalCount = 0, passedCount = 0, failedCount = 0, failedTests = [], 
resultTree = [], Package = {}, reportResults = function(results) {
    var test = _findTestForResults(results), status = _testStatus(test);
    if ("failed" === status ? failedCount-- : "succeeded" === status && passedCount--, 
    _.isArray(results.events)) {
        Array.prototype.push.apply(test.events || (test.events = []), results.events), test.events.sort(function(a, b) {
            return a.sequence - b.sequence;
        });
        var out = [];
        _.each(test.events, function(e) {
            (0 === out.length || out[out.length - 1].sequence !== e.sequence) && out.push(e);
        }), test.events = out;
    }
    status = _testStatus(test), "failed" === status ? (failedCount++, void 0 === test.expanded && (test.expanded = !0), 
    _.contains(failedTests, test.fullName) || failedTests.push(test.fullName)) : "succeeded" === status ? passedCount++ : test.expanded;
};

var _findTestForResults = function(results) {
    var groupPath = results.groupPath;
    if (!_.isArray(groupPath) || groupPath.length < 1) throw new Error("Test must be part of a group");
    var group, i = 0;
    _.each(groupPath, function(gname) {
        var array = group ? group.groups || (group.groups = []) : resultTree, newGroup = _.find(array, function(g) {
            return g.name === gname;
        });
        newGroup || (newGroup = {
            name: gname,
            parent: group || null,
            path: groupPath.slice(0, i + 1),
            dep: new Tracker.Dependency()
        }, array.push(newGroup)), group = newGroup, i++;
    });
    var testName = results.test, server = !!results.server, test = _.find(group.tests || (group.tests = []), function(t) {
        return t.name === testName && t.server === server;
    });
    if (!test) {
        var nameParts = _.clone(groupPath);
        nameParts.push(testName);
        var fullName = nameParts.join(" - ");
        test = {
            name: testName,
            parent: group,
            server: server,
            fullName: fullName,
            dep: new Tracker.Dependency()
        }, group.tests.push(test), totalCount++;
    }
    return test;
}, _testTime = function(t) {
    if (t.events && t.events.length > 0) {
        var lastEvent = _.last(t.events);
        if ("finish" === lastEvent.type && "number" == typeof lastEvent.timeMs) return lastEvent.timeMs;
    }
    return null;
}, _testStatus = function(t) {
    var events = t.events || [];
    return _.find(events, function(x) {
        return "exception" === x.type;
    }) ? "failed" : 0 == events.length || "finish" != _.last(events).type ? "running" : _.any(events, function(e) {
        return "fail" == e.type || "exception" == e.type;
    }) ? "failed" : "succeeded";
};