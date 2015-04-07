(function(exports, global) {
    global["Minimongo"] = exports;
    var __meteor_runtime_config__ = {};
    /**
 * @summary The Meteor namespace
 * @namespace Meteor
 */
    Meteor = {
        /**
   * @summary Boolean variable.  True if running in client environment.
   * @locus Anywhere
   * @static
   * @type {Boolean}
   */
        isClient: true,
        /**
   * @summary Boolean variable.  True if running in server environment.
   * @locus Anywhere
   * @static
   * @type {Boolean}
   */
        isServer: false,
        isCordova: false
    };
    if (typeof __meteor_runtime_config__ === "object" && __meteor_runtime_config__.PUBLIC_SETTINGS) {
        /**
   * @summary `Meteor.settings` contains deployment-specific configuration options. You can initialize settings by passing the `--settings` option (which takes the name of a file containing JSON data) to `meteor run` or `meteor deploy`. When running your server directly (e.g. from a bundle), you instead specify settings by putting the JSON directly into the `METEOR_SETTINGS` environment variable. If you don't provide any settings, `Meteor.settings` will be an empty object.  If the settings object contains a key named `public`, then `Meteor.settings.public` will be available on the client as well as the server.  All other properties of `Meteor.settings` are only defined on the server.
   * @locus Anywhere
   * @type {Object}
   */
        Meteor.settings = {
            "public": __meteor_runtime_config__.PUBLIC_SETTINGS
        };
    }
    if (Meteor.isServer) var Future = Npm.require("fibers/future");
    if (typeof __meteor_runtime_config__ === "object" && __meteor_runtime_config__.meteorRelease) {
        /**
   * @summary `Meteor.release` is a string containing the name of the [release](#meteorupdate) with which the project was built (for example, `"1.2.3"`). It is `undefined` if the project was built using a git checkout of Meteor.
   * @locus Anywhere
   * @type {String}
   */
        Meteor.release = __meteor_runtime_config__.meteorRelease;
    }
    // XXX find a better home for these? Ideally they would be _.get,
    // _.ensure, _.delete..
    _.extend(Meteor, {
        // _get(a,b,c,d) returns a[b][c][d], or else undefined if a[b] or
        // a[b][c] doesn't exist.
        //
        _get: function(obj) {
            for (var i = 1; i < arguments.length; i++) {
                if (!(arguments[i] in obj)) return undefined;
                obj = obj[arguments[i]];
            }
            return obj;
        },
        // _ensure(a,b,c,d) ensures that a[b][c][d] exists. If it does not,
        // it is created and set to {}. Either way, it is returned.
        //
        _ensure: function(obj) {
            for (var i = 1; i < arguments.length; i++) {
                var key = arguments[i];
                if (!(key in obj)) obj[key] = {};
                obj = obj[key];
            }
            return obj;
        },
        // _delete(a, b, c, d) deletes a[b][c][d], then a[b][c] unless it
        // isn't empty, then a[b] unless it isn't empty.
        //
        _delete: function(obj) {
            var stack = [ obj ];
            var leaf = true;
            for (var i = 1; i < arguments.length - 1; i++) {
                var key = arguments[i];
                if (!(key in obj)) {
                    leaf = false;
                    break;
                }
                obj = obj[key];
                if (typeof obj !== "object") break;
                stack.push(obj);
            }
            for (var i = stack.length - 1; i >= 0; i--) {
                var key = arguments[i + 1];
                if (leaf) leaf = false; else for (var other in stack[i][key]) return;
                // not empty -- we're done
                delete stack[i][key];
            }
        },
        // wrapAsync can wrap any function that takes some number of arguments that
        // can't be undefined, followed by some optional arguments, where the callback
        // is the last optional argument.
        // e.g. fs.readFile(pathname, [callback]),
        // fs.open(pathname, flags, [mode], [callback])
        // For maximum effectiveness and least confusion, wrapAsync should be used on
        // functions where the callback is the only argument of type Function.
        /**
   * @memberOf Meteor
   * @summary Wrap a function that takes a callback function as its final parameter. On the server, the wrapped function can be used either synchronously (without passing a callback) or asynchronously (when a callback is passed). On the client, a callback is always required; errors will be logged if there is no callback. If a callback is provided, the environment captured when the original function was called will be restored in the callback.
   * @locus Anywhere
   * @param {Function} func A function that takes a callback as its final parameter
   * @param {Object} [context] Optional `this` object against which the original function will be invoked
   */
        wrapAsync: function(fn, context) {
            return function() {
                var self = context || this;
                var newArgs = _.toArray(arguments);
                var callback;
                for (var i = newArgs.length - 1; i >= 0; --i) {
                    var arg = newArgs[i];
                    var type = typeof arg;
                    if (type !== "undefined") {
                        if (type === "function") {
                            callback = arg;
                        }
                        break;
                    }
                }
                if (!callback) {
                    if (Meteor.isClient) {
                        callback = logErr;
                    } else {
                        var fut = new Future();
                        callback = fut.resolver();
                    }
                    ++i;
                }
                newArgs[i] = Meteor.bindEnvironment(callback);
                var result = fn.apply(self, newArgs);
                return fut ? fut.wait() : result;
            };
        },
        // Sets child's prototype to a new object whose prototype is parent's
        // prototype. Used as:
        //   Meteor._inherits(ClassB, ClassA).
        //   _.extend(ClassB.prototype, { ... })
        // Inspired by CoffeeScript's `extend` and Google Closure's `goog.inherits`.
        _inherits: function(Child, Parent) {
            // copy Parent static properties
            for (var key in Parent) {
                // make sure we only copy hasOwnProperty properties vs. prototype
                // properties
                if (_.has(Parent, key)) Child[key] = Parent[key];
            }
            // a middle member of prototype chain: takes the prototype from the Parent
            var Middle = function() {
                this.constructor = Child;
            };
            Middle.prototype = Parent.prototype;
            Child.prototype = new Middle();
            Child.__super__ = Parent.prototype;
            return Child;
        }
    });
    var warnedAboutWrapAsync = false;
    /**
 * @deprecated in 0.9.3
 */
    Meteor._wrapAsync = function(fn, context) {
        if (!warnedAboutWrapAsync) {
            Meteor._debug("Meteor._wrapAsync has been renamed to Meteor.wrapAsync");
            warnedAboutWrapAsync = true;
        }
        return Meteor.wrapAsync.apply(Meteor, arguments);
    };
    function logErr(err) {
        if (err) {
            return Meteor._debug("Exception in callback of async function", err.stack ? err.stack : err);
        }
    }
    // Chooses one of three setImmediate implementations:
    //
    // * Native setImmediate (IE 10, Node 0.9+)
    //
    // * postMessage (many browsers)
    //
    // * setTimeout  (fallback)
    //
    // The postMessage implementation is based on
    // https://github.com/NobleJS/setImmediate/tree/1.0.1
    //
    // Don't use `nextTick` for Node since it runs its callbacks before
    // I/O, which is stricter than we're looking for.
    //
    // Not installed as a polyfill, as our public API is `Meteor.defer`.
    // Since we're not trying to be a polyfill, we have some
    // simplifications:
    //
    // If one invocation of a setImmediate callback pauses itself by a
    // call to alert/prompt/showModelDialog, the NobleJS polyfill
    // implementation ensured that no setImmedate callback would run until
    // the first invocation completed.  While correct per the spec, what it
    // would mean for us in practice is that any reactive updates relying
    // on Meteor.defer would be hung in the main window until the modal
    // dialog was dismissed.  Thus we only ensure that a setImmediate
    // function is called in a later event loop.
    //
    // We don't need to support using a string to be eval'ed for the
    // callback, arguments to the function, or clearImmediate.
    "use strict";
    var global = this;
    // IE 10, Node >= 9.1
    function useSetImmediate() {
        if (!global.setImmediate) return null; else {
            var setImmediate = function(fn) {
                global.setImmediate(fn);
            };
            setImmediate.implementation = "setImmediate";
            return setImmediate;
        }
    }
    // Android 2.3.6, Chrome 26, Firefox 20, IE 8-9, iOS 5.1.1 Safari
    function usePostMessage() {
        // The test against `importScripts` prevents this implementation
        // from being installed inside a web worker, where
        // `global.postMessage` means something completely different and
        // can't be used for this purpose.
        if (!global.postMessage || global.importScripts) {
            return null;
        }
        // Avoid synchronous post message implementations.
        var postMessageIsAsynchronous = true;
        var oldOnMessage = global.onmessage;
        global.onmessage = function() {
            postMessageIsAsynchronous = false;
        };
        global.postMessage("", "*");
        global.onmessage = oldOnMessage;
        if (!postMessageIsAsynchronous) return null;
        var funcIndex = 0;
        var funcs = {};
        // Installs an event handler on `global` for the `message` event: see
        // * https://developer.mozilla.org/en/DOM/window.postMessage
        // * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html#crossDocumentMessages
        // XXX use Random.id() here?
        var MESSAGE_PREFIX = "Meteor._setImmediate." + Math.random() + ".";
        function isStringAndStartsWith(string, putativeStart) {
            return typeof string === "string" && string.substring(0, putativeStart.length) === putativeStart;
        }
        function onGlobalMessage(event) {
            // This will catch all incoming messages (even from other
            // windows!), so we need to try reasonably hard to avoid letting
            // anyone else trick us into firing off. We test the origin is
            // still this window, and that a (randomly generated)
            // unpredictable identifying prefix is present.
            if (event.source === global && isStringAndStartsWith(event.data, MESSAGE_PREFIX)) {
                var index = event.data.substring(MESSAGE_PREFIX.length);
                try {
                    if (funcs[index]) funcs[index]();
                } finally {
                    delete funcs[index];
                }
            }
        }
        if (global.addEventListener) {
            global.addEventListener("message", onGlobalMessage, false);
        } else {
            global.attachEvent("onmessage", onGlobalMessage);
        }
        var setImmediate = function(fn) {
            // Make `global` post a message to itself with the handle and
            // identifying prefix, thus asynchronously invoking our
            // onGlobalMessage listener above.
            ++funcIndex;
            funcs[funcIndex] = fn;
            global.postMessage(MESSAGE_PREFIX + funcIndex, "*");
        };
        setImmediate.implementation = "postMessage";
        return setImmediate;
    }
    function useTimeout() {
        var setImmediate = function(fn) {
            global.setTimeout(fn, 0);
        };
        setImmediate.implementation = "setTimeout";
        return setImmediate;
    }
    Meteor._setImmediate = useSetImmediate() || usePostMessage() || useTimeout();
    var withoutInvocation = function(f) {
        if (Package.ddp) {
            var _CurrentInvocation = Package.ddp.DDP._CurrentInvocation;
            if (_CurrentInvocation.get() && _CurrentInvocation.get().isSimulation) throw new Error("Can't set timers inside simulations");
            return function() {
                _CurrentInvocation.withValue(null, f);
            };
        } else return f;
    };
    var bindAndCatch = function(context, f) {
        return Meteor.bindEnvironment(withoutInvocation(f), context);
    };
    _.extend(Meteor, {
        // Meteor.setTimeout and Meteor.setInterval callbacks scheduled
        // inside a server method are not part of the method invocation and
        // should clear out the CurrentInvocation environment variable.
        /**
   * @memberOf Meteor
   * @summary Call a function in the future after waiting for a specified delay.
   * @locus Anywhere
   * @param {Function} func The function to run
   * @param {Number} delay Number of milliseconds to wait before calling function
   */
        setTimeout: function(f, duration) {
            return setTimeout(bindAndCatch("setTimeout callback", f), duration);
        },
        /**
   * @memberOf Meteor
   * @summary Call a function repeatedly, with a time delay between calls.
   * @locus Anywhere
   * @param {Function} func The function to run
   * @param {Number} delay Number of milliseconds to wait between each function call.
   */
        setInterval: function(f, duration) {
            return setInterval(bindAndCatch("setInterval callback", f), duration);
        },
        /**
   * @memberOf Meteor
   * @summary Cancel a repeating function call scheduled by `Meteor.setInterval`.
   * @locus Anywhere
   * @param {Number} id The handle returned by `Meteor.setInterval`
   */
        clearInterval: function(x) {
            return clearInterval(x);
        },
        /**
   * @memberOf Meteor
   * @summary Cancel a function call scheduled by `Meteor.setTimeout`.
   * @locus Anywhere
   * @param {Number} id The handle returned by `Meteor.setTimeout`
   */
        clearTimeout: function(x) {
            return clearTimeout(x);
        },
        // XXX consider making this guarantee ordering of defer'd callbacks, like
        // Tracker.afterFlush or Node's nextTick (in practice). Then tests can do:
        //    callSomethingThatDefersSomeWork();
        //    Meteor.defer(expect(somethingThatValidatesThatTheWorkHappened));
        defer: function(f) {
            Meteor._setImmediate(bindAndCatch("defer callback", f));
        }
    });
    // Makes an error subclass which properly contains a stack trace in most
    // environments. constructor can set fields on `this` (and should probably set
    // `message`, which is what gets displayed at the top of a stack trace).
    //
    Meteor.makeErrorType = function(name, constructor) {
        var errorClass = function() {
            var self = this;
            // Ensure we get a proper stack trace in most Javascript environments
            if (Error.captureStackTrace) {
                // V8 environments (Chrome and Node.js)
                Error.captureStackTrace(self, errorClass);
            } else {
                // Firefox
                var e = new Error();
                e.__proto__ = errorClass.prototype;
                if (e instanceof errorClass) self = e;
            }
            // Safari magically works.
            constructor.apply(self, arguments);
            self.errorType = name;
            return self;
        };
        Meteor._inherits(errorClass, Error);
        return errorClass;
    };
    // This should probably be in the livedata package, but we don't want
    // to require you to use the livedata package to get it. Eventually we
    // should probably rename it to DDP.Error and put it back in the
    // 'livedata' package (which we should rename to 'ddp' also.)
    //
    // Note: The DDP server assumes that Meteor.Error EJSON-serializes as an object
    // containing 'error' and optionally 'reason' and 'details'.
    // The DDP client manually puts these into Meteor.Error objects. (We don't use
    // EJSON.addType here because the type is determined by location in the
    // protocol, not text on the wire.)
    /**
 * @summary This class represents a symbolic error thrown by a method.
 * @locus Anywhere
 * @class
 * @param {String} error A string code uniquely identifying this kind of error.
 * This string should be used by callers of the method to determine the
 * appropriate action to take, instead of attempting to parse the reason
 * or details fields. For example:
 *
 * ```
 * // on the server, pick a code unique to this error
 * // the reason field should be a useful debug message
 * throw new Meteor.Error("logged-out", 
 *   "The user must be logged in to post a comment.");
 *
 * // on the client
 * Meteor.call("methodName", function (error) {
 *   // identify the error
 *   if (error.error === "logged-out") {
 *     // show a nice error message
 *     Session.set("errorMessage", "Please log in to post a comment.");
 *   }
 * });
 * ```
 * 
 * For legacy reasons, some built-in Meteor functions such as `check` throw
 * errors with a number in this field.
 * 
 * @param {String} [reason] Optional.  A short human-readable summary of the
 * error, like 'Not Found'.
 * @param {String} [details] Optional.  Additional information about the error,
 * like a textual stack trace.
 */
    Meteor.Error = Meteor.makeErrorType("Meteor.Error", function(error, reason, details) {
        var self = this;
        // Currently, a numeric code, likely similar to a HTTP code (eg,
        // 404, 500). That is likely to change though.
        self.error = error;
        // Optional: A short human-readable summary of the error. Not
        // intended to be shown to end users, just developers. ("Not Found",
        // "Internal Server Error")
        self.reason = reason;
        // Optional: Additional information about the error, say for
        // debugging. It might be a (textual) stack trace if the server is
        // willing to provide one. The corresponding thing in HTTP would be
        // the body of a 404 or 500 response. (The difference is that we
        // never expect this to be shown to end users, only developers, so
        // it doesn't need to be pretty.)
        self.details = details;
        // This is what gets displayed at the top of a stack trace. Current
        // format is "[404]" (if no reason is set) or "File not found [404]"
        if (self.reason) self.message = self.reason + " [" + self.error + "]"; else self.message = "[" + self.error + "]";
    });
    // Meteor.Error is basically data and is sent over DDP, so you should be able to
    // properly EJSON-clone it. This is especially important because if a
    // Meteor.Error is thrown through a Future, the error, reason, and details
    // properties become non-enumerable so a standard Object clone won't preserve
    // them and they will be lost from DDP.
    Meteor.Error.prototype.clone = function() {
        var self = this;
        return new Meteor.Error(self.error, self.reason, self.details);
    };
    // This file is a partial analogue to fiber_helpers.js, which allows the client
    // to use a queue too, and also to call noYieldsAllowed.
    // The client has no ability to yield, so noYieldsAllowed is a noop.
    //
    Meteor._noYieldsAllowed = function(f) {
        return f();
    };
    // An even simpler queue of tasks than the fiber-enabled one.  This one just
    // runs all the tasks when you call runTask or flush, synchronously.
    //
    Meteor._SynchronousQueue = function() {
        var self = this;
        self._tasks = [];
        self._running = false;
        self._runTimeout = null;
    };
    _.extend(Meteor._SynchronousQueue.prototype, {
        runTask: function(task) {
            var self = this;
            if (!self.safeToRunTask()) throw new Error("Could not synchronously run a task from a running task");
            self._tasks.push(task);
            var tasks = self._tasks;
            self._tasks = [];
            self._running = true;
            if (self._runTimeout) {
                // Since we're going to drain the queue, we can forget about the timeout
                // which tries to run it.  (But if one of our tasks queues something else,
                // the timeout will be correctly re-created.)
                clearTimeout(self._runTimeout);
                self._runTimeout = null;
            }
            try {
                while (!_.isEmpty(tasks)) {
                    var t = tasks.shift();
                    try {
                        t();
                    } catch (e) {
                        if (_.isEmpty(tasks)) {
                            // this was the last task, that is, the one we're calling runTask
                            // for.
                            throw e;
                        } else {
                            Meteor._debug("Exception in queued task: " + e.stack);
                        }
                    }
                }
            } finally {
                self._running = false;
            }
        },
        queueTask: function(task) {
            var self = this;
            self._tasks.push(task);
            // Intentionally not using Meteor.setTimeout, because it doesn't like runing
            // in stubs for now.
            if (!self._runTimeout) {
                self._runTimeout = setTimeout(_.bind(self.flush, self), 0);
            }
        },
        flush: function() {
            var self = this;
            self.runTask(function() {});
        },
        drain: function() {
            var self = this;
            if (!self.safeToRunTask()) return;
            while (!_.isEmpty(self._tasks)) {
                self.flush();
            }
        },
        safeToRunTask: function() {
            var self = this;
            return !self._running;
        }
    });
    var suppress = 0;
    // replacement for console.log. This is a temporary API. We should
    // provide a real logging API soon (possibly just a polyfill for
    // console?)
    //
    // NOTE: this is used on the server to print the warning about
    // having autopublish enabled when you probably meant to turn it
    // off. it's not really the proper use of something called
    // _debug. the intent is for this message to go to the terminal and
    // be very visible. if you change _debug to go someplace else, etc,
    // please fix the autopublish code to do something reasonable.
    //
    Meteor._debug = function() {
        if (suppress) {
            suppress--;
            return;
        }
        if (typeof console !== "undefined" && typeof console.log !== "undefined") {
            if (arguments.length == 0) {
                // IE Companion breaks otherwise
                // IE10 PP4 requires at least one argument
                console.log("");
            } else {
                // IE doesn't have console.log.apply, it's not a real Object.
                // http://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9
                // http://patik.com/blog/complete-cross-browser-console-log/
                if (typeof console.log.apply === "function") {
                    // Most browsers
                    // Chrome and Safari only hyperlink URLs to source files in first argument of
                    // console.log, so try to call it with one argument if possible.
                    // Approach taken here: If all arguments are strings, join them on space.
                    // See https://github.com/meteor/meteor/pull/732#issuecomment-13975991
                    var allArgumentsOfTypeString = true;
                    for (var i = 0; i < arguments.length; i++) if (typeof arguments[i] !== "string") allArgumentsOfTypeString = false;
                    if (allArgumentsOfTypeString) console.log.apply(console, [ Array.prototype.join.call(arguments, " ") ]); else console.log.apply(console, arguments);
                } else if (typeof Function.prototype.bind === "function") {
                    // IE9
                    var log = Function.prototype.bind.call(console.log, console);
                    log.apply(console, arguments);
                } else {
                    // IE8
                    Function.prototype.call.call(console.log, console, Array.prototype.slice.call(arguments));
                }
            }
        }
    };
    // Suppress the next 'count' Meteor._debug messsages. Use this to
    // stop tests from spamming the console.
    //
    Meteor._suppress_log = function(count) {
        suppress += count;
    };
    Meteor._supressed_log_expected = function() {
        return suppress !== 0;
    };
    // Base 64 encoding
    var BASE_64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var BASE_64_VALS = {};
    for (var i = 0; i < BASE_64_CHARS.length; i++) {
        BASE_64_VALS[BASE_64_CHARS.charAt(i)] = i;
    }
    Base64 = {};
    Base64.encode = function(array) {
        if (typeof array === "string") {
            var str = array;
            array = Base64.newBinary(str.length);
            for (var i = 0; i < str.length; i++) {
                var ch = str.charCodeAt(i);
                if (ch > 255) {
                    throw new Error("Not ascii. Base64.encode can only take ascii strings.");
                }
                array[i] = ch;
            }
        }
        var answer = [];
        var a = null;
        var b = null;
        var c = null;
        var d = null;
        for (var i = 0; i < array.length; i++) {
            switch (i % 3) {
              case 0:
                a = array[i] >> 2 & 63;
                b = (array[i] & 3) << 4;
                break;

              case 1:
                b = b | array[i] >> 4 & 15;
                c = (array[i] & 15) << 2;
                break;

              case 2:
                c = c | array[i] >> 6 & 3;
                d = array[i] & 63;
                answer.push(getChar(a));
                answer.push(getChar(b));
                answer.push(getChar(c));
                answer.push(getChar(d));
                a = null;
                b = null;
                c = null;
                d = null;
                break;
            }
        }
        if (a != null) {
            answer.push(getChar(a));
            answer.push(getChar(b));
            if (c == null) answer.push("="); else answer.push(getChar(c));
            if (d == null) answer.push("=");
        }
        return answer.join("");
    };
    var getChar = function(val) {
        return BASE_64_CHARS.charAt(val);
    };
    var getVal = function(ch) {
        if (ch === "=") {
            return -1;
        }
        return BASE_64_VALS[ch];
    };
    // XXX This is a weird place for this to live, but it's used both by
    // this package and 'ejson', and we can't put it in 'ejson' without
    // introducing a circular dependency. It should probably be in its own
    // package or as a helper in a package that both 'base64' and 'ejson'
    // use.
    Base64.newBinary = function(len) {
        if (typeof Uint8Array === "undefined" || typeof ArrayBuffer === "undefined") {
            var ret = [];
            for (var i = 0; i < len; i++) {
                ret.push(0);
            }
            ret.$Uint8ArrayPolyfill = true;
            return ret;
        }
        return new Uint8Array(new ArrayBuffer(len));
    };
    Base64.decode = function(str) {
        var len = Math.floor(str.length * 3 / 4);
        if (str.charAt(str.length - 1) == "=") {
            len--;
            if (str.charAt(str.length - 2) == "=") len--;
        }
        var arr = Base64.newBinary(len);
        var one = null;
        var two = null;
        var three = null;
        var j = 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charAt(i);
            var v = getVal(c);
            switch (i % 4) {
              case 0:
                if (v < 0) throw new Error("invalid base64 string");
                one = v << 2;
                break;

              case 1:
                if (v < 0) throw new Error("invalid base64 string");
                one = one | v >> 4;
                arr[j++] = one;
                two = (v & 15) << 4;
                break;

              case 2:
                if (v >= 0) {
                    two = two | v >> 2;
                    arr[j++] = two;
                    three = (v & 3) << 6;
                }
                break;

              case 3:
                if (v >= 0) {
                    arr[j++] = three | v;
                }
                break;
            }
        }
        return arr;
    };
    /**
 * @namespace
 * @summary Namespace for EJSON functions
 */
    EJSON = {};
    EJSONTest = {};
    // Custom type interface definition
    /**
 * @class CustomType
 * @instanceName customType
 * @memberOf EJSON
 * @summary The interface that a class must satisfy to be able to become an
 * EJSON custom type via EJSON.addType.
 */
    /**
 * @function typeName
 * @memberOf EJSON.CustomType
 * @summary Return the tag used to identify this type.  This must match the tag used to register this type with [`EJSON.addType`](#ejson_add_type).
 * @locus Anywhere
 * @instance
 */
    /**
 * @function toJSONValue
 * @memberOf EJSON.CustomType
 * @summary Serialize this instance into a JSON-compatible value.
 * @locus Anywhere
 * @instance
 */
    /**
 * @function clone
 * @memberOf EJSON.CustomType
 * @summary Return a value `r` such that `this.equals(r)` is true, and modifications to `r` do not affect `this` and vice versa.
 * @locus Anywhere
 * @instance
 */
    /**
 * @function equals
 * @memberOf EJSON.CustomType
 * @summary Return `true` if `other` has a value equal to `this`; `false` otherwise.
 * @locus Anywhere
 * @param {Object} other Another object to compare this to.
 * @instance
 */
    var customTypes = {};
    // Add a custom type, using a method of your choice to get to and
    // from a basic JSON-able representation.  The factory argument
    // is a function of JSON-able --> your object
    // The type you add must have:
    // - A toJSONValue() method, so that Meteor can serialize it
    // - a typeName() method, to show how to look it up in our type table.
    // It is okay if these methods are monkey-patched on.
    // EJSON.clone will use toJSONValue and the given factory to produce
    // a clone, but you may specify a method clone() that will be
    // used instead.
    // Similarly, EJSON.equals will use toJSONValue to make comparisons,
    // but you may provide a method equals() instead.
    /**
 * @summary Add a custom datatype to EJSON.
 * @locus Anywhere
 * @param {String} name A tag for your custom type; must be unique among custom data types defined in your project, and must match the result of your type's `typeName` method.
 * @param {Function} factory A function that deserializes a JSON-compatible value into an instance of your type.  This should match the serialization performed by your type's `toJSONValue` method.
 */
    EJSON.addType = function(name, factory) {
        if (_.has(customTypes, name)) throw new Error("Type " + name + " already present");
        customTypes[name] = factory;
    };
    var isInfOrNan = function(obj) {
        return _.isNaN(obj) || obj === Infinity || obj === -Infinity;
    };
    var builtinConverters = [ {
        // Date
        matchJSONValue: function(obj) {
            return _.has(obj, "$date") && _.size(obj) === 1;
        },
        matchObject: function(obj) {
            return obj instanceof Date;
        },
        toJSONValue: function(obj) {
            return {
                $date: obj.getTime()
            };
        },
        fromJSONValue: function(obj) {
            return new Date(obj.$date);
        }
    }, {
        // NaN, Inf, -Inf. (These are the only objects with typeof !== 'object'
        // which we match.)
        matchJSONValue: function(obj) {
            return _.has(obj, "$InfNaN") && _.size(obj) === 1;
        },
        matchObject: isInfOrNan,
        toJSONValue: function(obj) {
            var sign;
            if (_.isNaN(obj)) sign = 0; else if (obj === Infinity) sign = 1; else sign = -1;
            return {
                $InfNaN: sign
            };
        },
        fromJSONValue: function(obj) {
            return obj.$InfNaN / 0;
        }
    }, {
        // Binary
        matchJSONValue: function(obj) {
            return _.has(obj, "$binary") && _.size(obj) === 1;
        },
        matchObject: function(obj) {
            return typeof Uint8Array !== "undefined" && obj instanceof Uint8Array || obj && _.has(obj, "$Uint8ArrayPolyfill");
        },
        toJSONValue: function(obj) {
            return {
                $binary: Base64.encode(obj)
            };
        },
        fromJSONValue: function(obj) {
            return Base64.decode(obj.$binary);
        }
    }, {
        // Escaping one level
        matchJSONValue: function(obj) {
            return _.has(obj, "$escape") && _.size(obj) === 1;
        },
        matchObject: function(obj) {
            if (_.isEmpty(obj) || _.size(obj) > 2) {
                return false;
            }
            return _.any(builtinConverters, function(converter) {
                return converter.matchJSONValue(obj);
            });
        },
        toJSONValue: function(obj) {
            var newObj = {};
            _.each(obj, function(value, key) {
                newObj[key] = EJSON.toJSONValue(value);
            });
            return {
                $escape: newObj
            };
        },
        fromJSONValue: function(obj) {
            var newObj = {};
            _.each(obj.$escape, function(value, key) {
                newObj[key] = EJSON.fromJSONValue(value);
            });
            return newObj;
        }
    }, {
        // Custom
        matchJSONValue: function(obj) {
            return _.has(obj, "$type") && _.has(obj, "$value") && _.size(obj) === 2;
        },
        matchObject: function(obj) {
            return EJSON._isCustomType(obj);
        },
        toJSONValue: function(obj) {
            var jsonValue = Meteor._noYieldsAllowed(function() {
                return obj.toJSONValue();
            });
            return {
                $type: obj.typeName(),
                $value: jsonValue
            };
        },
        fromJSONValue: function(obj) {
            var typeName = obj.$type;
            if (!_.has(customTypes, typeName)) throw new Error("Custom EJSON type " + typeName + " is not defined");
            var converter = customTypes[typeName];
            return Meteor._noYieldsAllowed(function() {
                return converter(obj.$value);
            });
        }
    } ];
    EJSON._isCustomType = function(obj) {
        return obj && typeof obj.toJSONValue === "function" && typeof obj.typeName === "function" && _.has(customTypes, obj.typeName());
    };
    // for both arrays and objects, in-place modification.
    var adjustTypesToJSONValue = EJSON._adjustTypesToJSONValue = function(obj) {
        // Is it an atom that we need to adjust?
        if (obj === null) return null;
        var maybeChanged = toJSONValueHelper(obj);
        if (maybeChanged !== undefined) return maybeChanged;
        // Other atoms are unchanged.
        if (typeof obj !== "object") return obj;
        // Iterate over array or object structure.
        _.each(obj, function(value, key) {
            if (typeof value !== "object" && value !== undefined && !isInfOrNan(value)) return;
            // continue
            var changed = toJSONValueHelper(value);
            if (changed) {
                obj[key] = changed;
                return;
            }
            // if we get here, value is an object but not adjustable
            // at this level.  recurse.
            adjustTypesToJSONValue(value);
        });
        return obj;
    };
    // Either return the JSON-compatible version of the argument, or undefined (if
    // the item isn't itself replaceable, but maybe some fields in it are)
    var toJSONValueHelper = function(item) {
        for (var i = 0; i < builtinConverters.length; i++) {
            var converter = builtinConverters[i];
            if (converter.matchObject(item)) {
                return converter.toJSONValue(item);
            }
        }
        return undefined;
    };
    /**
 * @summary Serialize an EJSON-compatible value into its plain JSON representation.
 * @locus Anywhere
 * @param {EJSON} val A value to serialize to plain JSON.
 */
    EJSON.toJSONValue = function(item) {
        var changed = toJSONValueHelper(item);
        if (changed !== undefined) return changed;
        if (typeof item === "object") {
            item = EJSON.clone(item);
            adjustTypesToJSONValue(item);
        }
        return item;
    };
    // for both arrays and objects. Tries its best to just
    // use the object you hand it, but may return something
    // different if the object you hand it itself needs changing.
    //
    var adjustTypesFromJSONValue = EJSON._adjustTypesFromJSONValue = function(obj) {
        if (obj === null) return null;
        var maybeChanged = fromJSONValueHelper(obj);
        if (maybeChanged !== obj) return maybeChanged;
        // Other atoms are unchanged.
        if (typeof obj !== "object") return obj;
        _.each(obj, function(value, key) {
            if (typeof value === "object") {
                var changed = fromJSONValueHelper(value);
                if (value !== changed) {
                    obj[key] = changed;
                    return;
                }
                // if we get here, value is an object but not adjustable
                // at this level.  recurse.
                adjustTypesFromJSONValue(value);
            }
        });
        return obj;
    };
    // Either return the argument changed to have the non-json
    // rep of itself (the Object version) or the argument itself.
    // DOES NOT RECURSE.  For actually getting the fully-changed value, use
    // EJSON.fromJSONValue
    var fromJSONValueHelper = function(value) {
        if (typeof value === "object" && value !== null) {
            if (_.size(value) <= 2 && _.all(value, function(v, k) {
                return typeof k === "string" && k.substr(0, 1) === "$";
            })) {
                for (var i = 0; i < builtinConverters.length; i++) {
                    var converter = builtinConverters[i];
                    if (converter.matchJSONValue(value)) {
                        return converter.fromJSONValue(value);
                    }
                }
            }
        }
        return value;
    };
    /**
 * @summary Deserialize an EJSON value from its plain JSON representation.
 * @locus Anywhere
 * @param {JSONCompatible} val A value to deserialize into EJSON.
 */
    EJSON.fromJSONValue = function(item) {
        var changed = fromJSONValueHelper(item);
        if (changed === item && typeof item === "object") {
            item = EJSON.clone(item);
            adjustTypesFromJSONValue(item);
            return item;
        } else {
            return changed;
        }
    };
    /**
 * @summary Serialize a value to a string.

For EJSON values, the serialization fully represents the value. For non-EJSON values, serializes the same way as `JSON.stringify`.
 * @locus Anywhere
 * @param {EJSON} val A value to stringify.
 * @param {Object} [options]
 * @param {Boolean | Integer | String} options.indent Indents objects and arrays for easy readability.  When `true`, indents by 2 spaces; when an integer, indents by that number of spaces; and when a string, uses the string as the indentation pattern.
 * @param {Boolean} options.canonical When `true`, stringifies keys in an object in sorted order.
 */
    EJSON.stringify = function(item, options) {
        var json = EJSON.toJSONValue(item);
        if (options && (options.canonical || options.indent)) {
            return EJSON._canonicalStringify(json, options);
        } else {
            return JSON.stringify(json);
        }
    };
    /**
 * @summary Parse a string into an EJSON value. Throws an error if the string is not valid EJSON.
 * @locus Anywhere
 * @param {String} str A string to parse into an EJSON value.
 */
    EJSON.parse = function(item) {
        if (typeof item !== "string") throw new Error("EJSON.parse argument should be a string");
        return EJSON.fromJSONValue(JSON.parse(item));
    };
    /**
 * @summary Returns true if `x` is a buffer of binary data, as returned from [`EJSON.newBinary`](#ejson_new_binary).
 * @param {Object} x The variable to check.
 * @locus Anywhere
 */
    EJSON.isBinary = function(obj) {
        return !!(typeof Uint8Array !== "undefined" && obj instanceof Uint8Array || obj && obj.$Uint8ArrayPolyfill);
    };
    /**
 * @summary Return true if `a` and `b` are equal to each other.  Return false otherwise.  Uses the `equals` method on `a` if present, otherwise performs a deep comparison.
 * @locus Anywhere
 * @param {EJSON} a
 * @param {EJSON} b
 * @param {Object} [options]
 * @param {Boolean} options.keyOrderSensitive Compare in key sensitive order, if supported by the JavaScript implementation.  For example, `{a: 1, b: 2}` is equal to `{b: 2, a: 1}` only when `keyOrderSensitive` is `false`.  The default is `false`.
 */
    EJSON.equals = function(a, b, options) {
        var i;
        var keyOrderSensitive = !!(options && options.keyOrderSensitive);
        if (a === b) return true;
        if (_.isNaN(a) && _.isNaN(b)) return true;
        // This differs from the IEEE spec for NaN equality, b/c we don't want
        // anything ever with a NaN to be poisoned from becoming equal to anything.
        if (!a || !b) // if either one is falsy, they'd have to be === to be equal
        return false;
        if (!(typeof a === "object" && typeof b === "object")) return false;
        if (a instanceof Date && b instanceof Date) return a.valueOf() === b.valueOf();
        if (EJSON.isBinary(a) && EJSON.isBinary(b)) {
            if (a.length !== b.length) return false;
            for (i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return false;
            }
            return true;
        }
        if (typeof a.equals === "function") return a.equals(b, options);
        if (typeof b.equals === "function") return b.equals(a, options);
        if (a instanceof Array) {
            if (!(b instanceof Array)) return false;
            if (a.length !== b.length) return false;
            for (i = 0; i < a.length; i++) {
                if (!EJSON.equals(a[i], b[i], options)) return false;
            }
            return true;
        }
        // fallback for custom types that don't implement their own equals
        switch (EJSON._isCustomType(a) + EJSON._isCustomType(b)) {
          case 1:
            return false;

          case 2:
            return EJSON.equals(EJSON.toJSONValue(a), EJSON.toJSONValue(b));
        }
        // fall back to structural equality of objects
        var ret;
        if (keyOrderSensitive) {
            var bKeys = [];
            _.each(b, function(val, x) {
                bKeys.push(x);
            });
            i = 0;
            ret = _.all(a, function(val, x) {
                if (i >= bKeys.length) {
                    return false;
                }
                if (x !== bKeys[i]) {
                    return false;
                }
                if (!EJSON.equals(val, b[bKeys[i]], options)) {
                    return false;
                }
                i++;
                return true;
            });
            return ret && i === bKeys.length;
        } else {
            i = 0;
            ret = _.all(a, function(val, key) {
                if (!_.has(b, key)) {
                    return false;
                }
                if (!EJSON.equals(val, b[key], options)) {
                    return false;
                }
                i++;
                return true;
            });
            return ret && _.size(b) === i;
        }
    };
    /**
 * @summary Return a deep copy of `val`.
 * @locus Anywhere
 * @param {EJSON} val A value to copy.
 */
    EJSON.clone = function(v) {
        var ret;
        if (typeof v !== "object") return v;
        if (v === null) return null;
        // null has typeof "object"
        if (v instanceof Date) return new Date(v.getTime());
        // RegExps are not really EJSON elements (eg we don't define a serialization
        // for them), but they're immutable anyway, so we can support them in clone.
        if (v instanceof RegExp) return v;
        if (EJSON.isBinary(v)) {
            ret = EJSON.newBinary(v.length);
            for (var i = 0; i < v.length; i++) {
                ret[i] = v[i];
            }
            return ret;
        }
        // XXX: Use something better than underscore's isArray
        if (_.isArray(v) || _.isArguments(v)) {
            // For some reason, _.map doesn't work in this context on Opera (weird test
            // failures).
            ret = [];
            for (i = 0; i < v.length; i++) ret[i] = EJSON.clone(v[i]);
            return ret;
        }
        // handle general user-defined typed Objects if they have a clone method
        if (typeof v.clone === "function") {
            return v.clone();
        }
        // handle other custom types
        if (EJSON._isCustomType(v)) {
            return EJSON.fromJSONValue(EJSON.clone(EJSON.toJSONValue(v)), true);
        }
        // handle other objects
        ret = {};
        _.each(v, function(value, key) {
            ret[key] = EJSON.clone(value);
        });
        return ret;
    };
    /**
 * @summary Allocate a new buffer of binary data that EJSON can serialize.
 * @locus Anywhere
 * @param {Number} size The number of bytes of binary data to allocate.
 */
    // EJSON.newBinary is the public documented API for this functionality,
    // but the implementation is in the 'base64' package to avoid
    // introducing a circular dependency. (If the implementation were here,
    // then 'base64' would have to use EJSON.newBinary, and 'ejson' would
    // also have to use 'base64'.)
    EJSON.newBinary = Base64.newBinary;
    IdMap = function(idStringify, idParse) {
        var self = this;
        self._map = {};
        self._idStringify = idStringify || JSON.stringify;
        self._idParse = idParse || JSON.parse;
    };
    // Some of these methods are designed to match methods on OrderedDict, since
    // (eg) ObserveMultiplex and _CachingChangeObserver use them interchangeably.
    // (Conceivably, this should be replaced with "UnorderedDict" with a specific
    // set of methods that overlap between the two.)
    _.extend(IdMap.prototype, {
        get: function(id) {
            var self = this;
            var key = self._idStringify(id);
            return self._map[key];
        },
        set: function(id, value) {
            var self = this;
            var key = self._idStringify(id);
            self._map[key] = value;
        },
        remove: function(id) {
            var self = this;
            var key = self._idStringify(id);
            delete self._map[key];
        },
        has: function(id) {
            var self = this;
            var key = self._idStringify(id);
            return _.has(self._map, key);
        },
        empty: function() {
            var self = this;
            return _.isEmpty(self._map);
        },
        clear: function() {
            var self = this;
            self._map = {};
        },
        // Iterates over the items in the map. Return `false` to break the loop.
        forEach: function(iterator) {
            var self = this;
            // don't use _.each, because we can't break out of it.
            var keys = _.keys(self._map);
            for (var i = 0; i < keys.length; i++) {
                var breakIfFalse = iterator.call(null, self._map[keys[i]], self._idParse(keys[i]));
                if (breakIfFalse === false) return;
            }
        },
        size: function() {
            var self = this;
            return _.size(self._map);
        },
        setDefault: function(id, def) {
            var self = this;
            var key = self._idStringify(id);
            if (_.has(self._map, key)) return self._map[key];
            self._map[key] = def;
            return def;
        },
        // Assumes that values are EJSON-cloneable, and that we don't need to clone
        // IDs (ie, that nobody is going to mutate an ObjectId).
        clone: function() {
            var self = this;
            var clone = new IdMap(self._idStringify, self._idParse);
            self.forEach(function(value, id) {
                clone.set(id, EJSON.clone(value));
            });
            return clone;
        }
    });
    // This file defines an ordered dictionary abstraction that is useful for
    // maintaining a dataset backed by observeChanges.  It supports ordering items
    // by specifying the item they now come before.
    // The implementation is a dictionary that contains nodes of a doubly-linked
    // list as its values.
    // constructs a new element struct
    // next and prev are whole elements, not keys.
    var element = function(key, value, next, prev) {
        return {
            key: key,
            value: value,
            next: next,
            prev: prev
        };
    };
    OrderedDict = function() {
        var self = this;
        self._dict = {};
        self._first = null;
        self._last = null;
        self._size = 0;
        var args = _.toArray(arguments);
        self._stringify = function(x) {
            return x;
        };
        if (typeof args[0] === "function") self._stringify = args.shift();
        _.each(args, function(kv) {
            self.putBefore(kv[0], kv[1], null);
        });
    };
    _.extend(OrderedDict.prototype, {
        // the "prefix keys with a space" thing comes from here
        // https://github.com/documentcloud/underscore/issues/376#issuecomment-2815649
        _k: function(key) {
            return " " + this._stringify(key);
        },
        empty: function() {
            var self = this;
            return !self._first;
        },
        size: function() {
            var self = this;
            return self._size;
        },
        _linkEltIn: function(elt) {
            var self = this;
            if (!elt.next) {
                elt.prev = self._last;
                if (self._last) self._last.next = elt;
                self._last = elt;
            } else {
                elt.prev = elt.next.prev;
                elt.next.prev = elt;
                if (elt.prev) elt.prev.next = elt;
            }
            if (self._first === null || self._first === elt.next) self._first = elt;
        },
        _linkEltOut: function(elt) {
            var self = this;
            if (elt.next) elt.next.prev = elt.prev;
            if (elt.prev) elt.prev.next = elt.next;
            if (elt === self._last) self._last = elt.prev;
            if (elt === self._first) self._first = elt.next;
        },
        putBefore: function(key, item, before) {
            var self = this;
            if (self._dict[self._k(key)]) throw new Error("Item " + key + " already present in OrderedDict");
            var elt = before ? element(key, item, self._dict[self._k(before)]) : element(key, item, null);
            if (elt.next === undefined) throw new Error("could not find item to put this one before");
            self._linkEltIn(elt);
            self._dict[self._k(key)] = elt;
            self._size++;
        },
        append: function(key, item) {
            var self = this;
            self.putBefore(key, item, null);
        },
        remove: function(key) {
            var self = this;
            var elt = self._dict[self._k(key)];
            if (elt === undefined) throw new Error("Item " + key + " not present in OrderedDict");
            self._linkEltOut(elt);
            self._size--;
            delete self._dict[self._k(key)];
            return elt.value;
        },
        get: function(key) {
            var self = this;
            if (self.has(key)) return self._dict[self._k(key)].value;
            return undefined;
        },
        has: function(key) {
            var self = this;
            return _.has(self._dict, self._k(key));
        },
        // Iterate through the items in this dictionary in order, calling
        // iter(value, key, index) on each one.
        // Stops whenever iter returns OrderedDict.BREAK, or after the last element.
        forEach: function(iter) {
            var self = this;
            var i = 0;
            var elt = self._first;
            while (elt !== null) {
                var b = iter(elt.value, elt.key, i);
                if (b === OrderedDict.BREAK) return;
                elt = elt.next;
                i++;
            }
        },
        first: function() {
            var self = this;
            if (self.empty()) return undefined;
            return self._first.key;
        },
        firstValue: function() {
            var self = this;
            if (self.empty()) return undefined;
            return self._first.value;
        },
        last: function() {
            var self = this;
            if (self.empty()) return undefined;
            return self._last.key;
        },
        lastValue: function() {
            var self = this;
            if (self.empty()) return undefined;
            return self._last.value;
        },
        prev: function(key) {
            var self = this;
            if (self.has(key)) {
                var elt = self._dict[self._k(key)];
                if (elt.prev) return elt.prev.key;
            }
            return null;
        },
        next: function(key) {
            var self = this;
            if (self.has(key)) {
                var elt = self._dict[self._k(key)];
                if (elt.next) return elt.next.key;
            }
            return null;
        },
        moveBefore: function(key, before) {
            var self = this;
            var elt = self._dict[self._k(key)];
            var eltBefore = before ? self._dict[self._k(before)] : null;
            if (elt === undefined) throw new Error("Item to move is not present");
            if (eltBefore === undefined) {
                throw new Error("Could not find element to move this one before");
            }
            if (eltBefore === elt.next) // no moving necessary
            return;
            // remove from its old place
            self._linkEltOut(elt);
            // patch into its new place
            elt.next = eltBefore;
            self._linkEltIn(elt);
        },
        // Linear, sadly.
        indexOf: function(key) {
            var self = this;
            var ret = null;
            self.forEach(function(v, k, i) {
                if (self._k(k) === self._k(key)) {
                    ret = i;
                    return OrderedDict.BREAK;
                }
                return undefined;
            });
            return ret;
        },
        _checkRep: function() {
            var self = this;
            _.each(self._dict, function(k, v) {
                if (v.next === v) throw new Error("Next is a loop");
                if (v.prev === v) throw new Error("Prev is a loop");
            });
        }
    });
    OrderedDict.BREAK = {
        "break": true
    };
    /////////////////////////////////////////////////////
    // Package docs at http://docs.meteor.com/#tracker //
    /////////////////////////////////////////////////////
    /**
 * @namespace Tracker
 * @summary The namespace for Tracker-related methods.
 */
    Tracker = {};
    // http://docs.meteor.com/#tracker_active
    /**
 * @summary True if there is a current computation, meaning that dependencies on reactive data sources will be tracked and potentially cause the current computation to be rerun.
 * @locus Client
 * @type {Boolean}
 */
    Tracker.active = false;
    // http://docs.meteor.com/#tracker_currentcomputation
    /**
 * @summary The current computation, or `null` if there isn't one.  The current computation is the [`Tracker.Computation`](#tracker_computation) object created by the innermost active call to `Tracker.autorun`, and it's the computation that gains dependencies when reactive data sources are accessed.
 * @locus Client
 * @type {Tracker.Computation}
 */
    Tracker.currentComputation = null;
    // References to all computations created within the Tracker by id.
    // Keeping these references on an underscore property gives more control to
    // tooling and packages extending Tracker without increasing the API surface.
    // These can used to monkey-patch computations, their functions, use
    // computation ids for tracking, etc.
    Tracker._computations = {};
    var setCurrentComputation = function(c) {
        Tracker.currentComputation = c;
        Tracker.active = !!c;
    };
    var _debugFunc = function() {
        // We want this code to work without Meteor, and also without
        // "console" (which is technically non-standard and may be missing
        // on some browser we come across, like it was on IE 7).
        //
        // Lazy evaluation because `Meteor` does not exist right away.(??)
        return typeof Meteor !== "undefined" ? Meteor._debug : typeof console !== "undefined" && console.error ? function() {
            console.error.apply(console, arguments);
        } : function() {};
    };
    var _maybeSupressMoreLogs = function(messagesLength) {
        // Sometimes when running tests, we intentionally supress logs on expected
        // printed errors. Since the current implementation of _throwOrLog can log
        // multiple separate log messages, supress all of them if at least one supress
        // is expected as we still want them to count as one.
        if (typeof Meteor !== "undefined") {
            if (Meteor._supressed_log_expected()) {
                Meteor._suppress_log(messagesLength - 1);
            }
        }
    };
    var _throwOrLog = function(from, e) {
        if (throwFirstError) {
            throw e;
        } else {
            var printArgs = [ "Exception from Tracker " + from + " function:" ];
            if (e.stack && e.message && e.name) {
                var idx = e.stack.indexOf(e.message);
                if (idx < 0 || idx > e.name.length + 2) {
                    // check for "Error: "
                    // message is not part of the stack
                    var message = e.name + ": " + e.message;
                    printArgs.push(message);
                }
            }
            printArgs.push(e.stack);
            _maybeSupressMoreLogs(printArgs.length);
            for (var i = 0; i < printArgs.length; i++) {
                _debugFunc()(printArgs[i]);
            }
        }
    };
    // Takes a function `f`, and wraps it in a `Meteor._noYieldsAllowed`
    // block if we are running on the server. On the client, returns the
    // original function (since `Meteor._noYieldsAllowed` is a
    // no-op). This has the benefit of not adding an unnecessary stack
    // frame on the client.
    var withNoYieldsAllowed = function(f) {
        if (typeof Meteor === "undefined" || Meteor.isClient) {
            return f;
        } else {
            return function() {
                var args = arguments;
                Meteor._noYieldsAllowed(function() {
                    f.apply(null, args);
                });
            };
        }
    };
    var nextId = 1;
    // computations whose callbacks we should call at flush time
    var pendingComputations = [];
    // `true` if a Tracker.flush is scheduled, or if we are in Tracker.flush now
    var willFlush = false;
    // `true` if we are in Tracker.flush now
    var inFlush = false;
    // `true` if we are computing a computation now, either first time
    // or recompute.  This matches Tracker.active unless we are inside
    // Tracker.nonreactive, which nullfies currentComputation even though
    // an enclosing computation may still be running.
    var inCompute = false;
    // `true` if the `_throwFirstError` option was passed in to the call
    // to Tracker.flush that we are in. When set, throw rather than log the
    // first error encountered while flushing. Before throwing the error,
    // finish flushing (from a finally block), logging any subsequent
    // errors.
    var throwFirstError = false;
    var afterFlushCallbacks = [];
    var requireFlush = function() {
        if (!willFlush) {
            // We want this code to work without Meteor, see debugFunc above
            if (typeof Meteor !== "undefined") Meteor._setImmediate(Tracker._runFlush); else setTimeout(Tracker._runFlush, 0);
            willFlush = true;
        }
    };
    // Tracker.Computation constructor is visible but private
    // (throws an error if you try to call it)
    var constructingComputation = false;
    //
    // http://docs.meteor.com/#tracker_computation
    /**
 * @summary A Computation object represents code that is repeatedly rerun
 * in response to
 * reactive data changes. Computations don't have return values; they just
 * perform actions, such as rerendering a template on the screen. Computations
 * are created using Tracker.autorun. Use stop to prevent further rerunning of a
 * computation.
 * @instancename computation
 */
    Tracker.Computation = function(f, parent, onError) {
        if (!constructingComputation) throw new Error("Tracker.Computation constructor is private; use Tracker.autorun");
        constructingComputation = false;
        var self = this;
        // http://docs.meteor.com/#computation_stopped
        /**
   * @summary True if this computation has been stopped.
   * @locus Client
   * @memberOf Tracker.Computation
   * @instance
   * @name  stopped
   */
        self.stopped = false;
        // http://docs.meteor.com/#computation_invalidated
        /**
   * @summary True if this computation has been invalidated (and not yet rerun), or if it has been stopped.
   * @locus Client
   * @memberOf Tracker.Computation
   * @instance
   * @name  invalidated
   * @type {Boolean}
   */
        self.invalidated = false;
        // http://docs.meteor.com/#computation_firstrun
        /**
   * @summary True during the initial run of the computation at the time `Tracker.autorun` is called, and false on subsequent reruns and at other times.
   * @locus Client
   * @memberOf Tracker.Computation
   * @instance
   * @name  firstRun
   * @type {Boolean}
   */
        self.firstRun = true;
        self._id = nextId++;
        self._onInvalidateCallbacks = [];
        // the plan is at some point to use the parent relation
        // to constrain the order that computations are processed
        self._parent = parent;
        self._func = f;
        self._onError = onError;
        self._recomputing = false;
        // Register the computation within the global Tracker.
        Tracker._computations[self._id] = self;
        var errored = true;
        try {
            self._compute();
            errored = false;
        } finally {
            self.firstRun = false;
            if (errored) self.stop();
        }
    };
    // http://docs.meteor.com/#computation_oninvalidate
    /**
 * @summary Registers `callback` to run when this computation is next invalidated, or runs it immediately if the computation is already invalidated.  The callback is run exactly once and not upon future invalidations unless `onInvalidate` is called again after the computation becomes valid again.
 * @locus Client
 * @param {Function} callback Function to be called on invalidation. Receives one argument, the computation that was invalidated.
 */
    Tracker.Computation.prototype.onInvalidate = function(f) {
        var self = this;
        if (typeof f !== "function") throw new Error("onInvalidate requires a function");
        if (self.invalidated) {
            Tracker.nonreactive(function() {
                withNoYieldsAllowed(f)(self);
            });
        } else {
            self._onInvalidateCallbacks.push(f);
        }
    };
    // http://docs.meteor.com/#computation_invalidate
    /**
 * @summary Invalidates this computation so that it will be rerun.
 * @locus Client
 */
    Tracker.Computation.prototype.invalidate = function() {
        var self = this;
        if (!self.invalidated) {
            // if we're currently in _recompute(), don't enqueue
            // ourselves, since we'll rerun immediately anyway.
            if (!self._recomputing && !self.stopped) {
                requireFlush();
                pendingComputations.push(this);
            }
            self.invalidated = true;
            // callbacks can't add callbacks, because
            // self.invalidated === true.
            for (var i = 0, f; f = self._onInvalidateCallbacks[i]; i++) {
                Tracker.nonreactive(function() {
                    withNoYieldsAllowed(f)(self);
                });
            }
            self._onInvalidateCallbacks = [];
        }
    };
    // http://docs.meteor.com/#computation_stop
    /**
 * @summary Prevents this computation from rerunning.
 * @locus Client
 */
    Tracker.Computation.prototype.stop = function() {
        if (!this.stopped) {
            this.stopped = true;
            this.invalidate();
            // Unregister from global Tracker.
            delete Tracker._computations[this._id];
        }
    };
    Tracker.Computation.prototype._compute = function() {
        var self = this;
        self.invalidated = false;
        var previous = Tracker.currentComputation;
        setCurrentComputation(self);
        var previousInCompute = inCompute;
        inCompute = true;
        try {
            withNoYieldsAllowed(self._func)(self);
        } finally {
            setCurrentComputation(previous);
            inCompute = previousInCompute;
        }
    };
    Tracker.Computation.prototype._needsRecompute = function() {
        var self = this;
        return self.invalidated && !self.stopped;
    };
    Tracker.Computation.prototype._recompute = function() {
        var self = this;
        self._recomputing = true;
        try {
            if (self._needsRecompute()) {
                try {
                    self._compute();
                } catch (e) {
                    if (self._onError) {
                        self._onError(e);
                    } else {
                        _throwOrLog("recompute", e);
                    }
                }
            }
        } finally {
            self._recomputing = false;
        }
    };
    //
    // http://docs.meteor.com/#tracker_dependency
    /**
 * @summary A Dependency represents an atomic unit of reactive data that a
 * computation might depend on. Reactive data sources such as Session or
 * Minimongo internally create different Dependency objects for different
 * pieces of data, each of which may be depended on by multiple computations.
 * When the data changes, the computations are invalidated.
 * @class
 * @instanceName dependency
 */
    Tracker.Dependency = function() {
        this._dependentsById = {};
    };
    // http://docs.meteor.com/#dependency_depend
    //
    // Adds `computation` to this set if it is not already
    // present.  Returns true if `computation` is a new member of the set.
    // If no argument, defaults to currentComputation, or does nothing
    // if there is no currentComputation.
    /**
 * @summary Declares that the current computation (or `fromComputation` if given) depends on `dependency`.  The computation will be invalidated the next time `dependency` changes.

If there is no current computation and `depend()` is called with no arguments, it does nothing and returns false.

Returns true if the computation is a new dependent of `dependency` rather than an existing one.
 * @locus Client
 * @param {Tracker.Computation} [fromComputation] An optional computation declared to depend on `dependency` instead of the current computation.
 * @returns {Boolean}
 */
    Tracker.Dependency.prototype.depend = function(computation) {
        if (!computation) {
            if (!Tracker.active) return false;
            computation = Tracker.currentComputation;
        }
        var self = this;
        var id = computation._id;
        if (!(id in self._dependentsById)) {
            self._dependentsById[id] = computation;
            computation.onInvalidate(function() {
                delete self._dependentsById[id];
            });
            return true;
        }
        return false;
    };
    // http://docs.meteor.com/#dependency_changed
    /**
 * @summary Invalidate all dependent computations immediately and remove them as dependents.
 * @locus Client
 */
    Tracker.Dependency.prototype.changed = function() {
        var self = this;
        for (var id in self._dependentsById) self._dependentsById[id].invalidate();
    };
    // http://docs.meteor.com/#dependency_hasdependents
    /**
 * @summary True if this Dependency has one or more dependent Computations, which would be invalidated if this Dependency were to change.
 * @locus Client
 * @returns {Boolean}
 */
    Tracker.Dependency.prototype.hasDependents = function() {
        var self = this;
        for (var id in self._dependentsById) return true;
        return false;
    };
    // http://docs.meteor.com/#tracker_flush
    /**
 * @summary Process all reactive updates immediately and ensure that all invalidated computations are rerun.
 * @locus Client
 */
    Tracker.flush = function(options) {
        Tracker._runFlush({
            finishSynchronously: true,
            throwFirstError: options && options._throwFirstError
        });
    };
    // Run all pending computations and afterFlush callbacks.  If we were not called
    // directly via Tracker.flush, this may return before they're all done to allow
    // the event loop to run a little before continuing.
    Tracker._runFlush = function(options) {
        // XXX What part of the comment below is still true? (We no longer
        // have Spark)
        //
        // Nested flush could plausibly happen if, say, a flush causes
        // DOM mutation, which causes a "blur" event, which runs an
        // app event handler that calls Tracker.flush.  At the moment
        // Spark blocks event handlers during DOM mutation anyway,
        // because the LiveRange tree isn't valid.  And we don't have
        // any useful notion of a nested flush.
        //
        // https://app.asana.com/0/159908330244/385138233856
        if (inFlush) throw new Error("Can't call Tracker.flush while flushing");
        if (inCompute) throw new Error("Can't flush inside Tracker.autorun");
        options = options || {};
        inFlush = true;
        willFlush = true;
        throwFirstError = !!options.throwFirstError;
        var recomputedCount = 0;
        var finishedTry = false;
        try {
            while (pendingComputations.length || afterFlushCallbacks.length) {
                // recompute all pending computations
                while (pendingComputations.length) {
                    var comp = pendingComputations.shift();
                    comp._recompute();
                    if (comp._needsRecompute()) {
                        pendingComputations.unshift(comp);
                    }
                    if (!options.finishSynchronously && ++recomputedCount > 1e3) {
                        finishedTry = true;
                        return;
                    }
                }
                if (afterFlushCallbacks.length) {
                    // call one afterFlush callback, which may
                    // invalidate more computations
                    var func = afterFlushCallbacks.shift();
                    try {
                        func();
                    } catch (e) {
                        _throwOrLog("afterFlush", e);
                    }
                }
            }
            finishedTry = true;
        } finally {
            if (!finishedTry) {
                // we're erroring due to throwFirstError being true.
                inFlush = false;
                // needed before calling `Tracker.flush()` again
                // finish flushing
                Tracker._runFlush({
                    finishSynchronously: options.finishSynchronously,
                    throwFirstError: false
                });
            }
            willFlush = false;
            inFlush = false;
            if (pendingComputations.length || afterFlushCallbacks.length) {
                // We're yielding because we ran a bunch of computations and we aren't
                // required to finish synchronously, so we'd like to give the event loop a
                // chance. We should flush again soon.
                if (options.finishSynchronously) {
                    throw new Error("still have more to do?");
                }
                setTimeout(requireFlush, 10);
            }
        }
    };
    // http://docs.meteor.com/#tracker_autorun
    //
    // Run f(). Record its dependencies. Rerun it whenever the
    // dependencies change.
    //
    // Returns a new Computation, which is also passed to f.
    //
    // Links the computation to the current computation
    // so that it is stopped if the current computation is invalidated.
    /**
 * @callback Tracker.ComputationFunction
 * @param {Tracker.Computation}
 */
    /**
 * @summary Run a function now and rerun it later whenever its dependencies
 * change. Returns a Computation object that can be used to stop or observe the
 * rerunning.
 * @locus Client
 * @param {Tracker.ComputationFunction} runFunc The function to run. It receives
 * one argument: the Computation object that will be returned.
 * @param {Object} [options]
 * @param {Function} options.onError Optional. The function to run when an error
 * happens in the Computation. The only argument it recieves is the Error
 * thrown. Defaults to the error being logged to the console.
 * @returns {Tracker.Computation}
 */
    Tracker.autorun = function(f, options) {
        if (typeof f !== "function") throw new Error("Tracker.autorun requires a function argument");
        options = options || {};
        constructingComputation = true;
        var c = new Tracker.Computation(f, Tracker.currentComputation, options.onError);
        if (Tracker.active) Tracker.onInvalidate(function() {
            c.stop();
        });
        return c;
    };
    // http://docs.meteor.com/#tracker_nonreactive
    //
    // Run `f` with no current computation, returning the return value
    // of `f`.  Used to turn off reactivity for the duration of `f`,
    // so that reactive data sources accessed by `f` will not result in any
    // computations being invalidated.
    /**
 * @summary Run a function without tracking dependencies.
 * @locus Client
 * @param {Function} func A function to call immediately.
 */
    Tracker.nonreactive = function(f) {
        var previous = Tracker.currentComputation;
        setCurrentComputation(null);
        try {
            return f();
        } finally {
            setCurrentComputation(previous);
        }
    };
    // http://docs.meteor.com/#tracker_oninvalidate
    /**
 * @summary Registers a new [`onInvalidate`](#computation_oninvalidate) callback on the current computation (which must exist), to be called immediately when the current computation is invalidated or stopped.
 * @locus Client
 * @param {Function} callback A callback function that will be invoked as `func(c)`, where `c` is the computation on which the callback is registered.
 */
    Tracker.onInvalidate = function(f) {
        if (!Tracker.active) throw new Error("Tracker.onInvalidate requires a currentComputation");
        Tracker.currentComputation.onInvalidate(f);
    };
    // http://docs.meteor.com/#tracker_afterflush
    /**
 * @summary Schedules a function to be called during the next flush, or later in the current flush if one is in progress, after all invalidated computations have been rerun.  The function will be run once and not on subsequent flushes unless `afterFlush` is called again.
 * @locus Client
 * @param {Function} callback A function to call at flush time.
 */
    Tracker.afterFlush = function(f) {
        afterFlushCallbacks.push(f);
        requireFlush();
    };
    // Deprecated functions.
    // These functions used to be on the Meteor object (and worked slightly
    // differently).
    // XXX COMPAT WITH 0.5.7
    Meteor.flush = Tracker.flush;
    Meteor.autorun = Tracker.autorun;
    // We used to require a special "autosubscribe" call to reactively subscribe to
    // things. Now, it works with autorun.
    // XXX COMPAT WITH 0.5.4
    Meteor.autosubscribe = Tracker.autorun;
    // This Tracker API briefly existed in 0.5.8 and 0.5.9
    // XXX COMPAT WITH 0.5.9
    Tracker.depend = function(d) {
        return d.depend();
    };
    Deps = Tracker;
    // We use cryptographically strong PRNGs (crypto.getRandomBytes() on the server,
    // window.crypto.getRandomValues() in the browser) when available. If these
    // PRNGs fail, we fall back to the Alea PRNG, which is not cryptographically
    // strong, and we seed it with various sources such as the date, Math.random,
    // and window size on the client.  When using crypto.getRandomValues(), our
    // primitive is hexString(), from which we construct fraction(). When using
    // window.crypto.getRandomValues() or alea, the primitive is fraction and we use
    // that to construct hex string.
    if (Meteor.isServer) var nodeCrypto = Npm.require("crypto");
    // see http://baagoe.org/en/wiki/Better_random_numbers_for_javascript
    // for a full discussion and Alea implementation.
    var Alea = function() {
        function Mash() {
            var n = 4022871197;
            var mash = function(data) {
                data = data.toString();
                for (var i = 0; i < data.length; i++) {
                    n += data.charCodeAt(i);
                    var h = .02519603282416938 * n;
                    n = h >>> 0;
                    h -= n;
                    h *= n;
                    n = h >>> 0;
                    h -= n;
                    n += h * 4294967296;
                }
                return (n >>> 0) * 2.3283064365386963e-10;
            };
            mash.version = "Mash 0.9";
            return mash;
        }
        return function(args) {
            var s0 = 0;
            var s1 = 0;
            var s2 = 0;
            var c = 1;
            if (args.length == 0) {
                args = [ +new Date() ];
            }
            var mash = Mash();
            s0 = mash(" ");
            s1 = mash(" ");
            s2 = mash(" ");
            for (var i = 0; i < args.length; i++) {
                s0 -= mash(args[i]);
                if (s0 < 0) {
                    s0 += 1;
                }
                s1 -= mash(args[i]);
                if (s1 < 0) {
                    s1 += 1;
                }
                s2 -= mash(args[i]);
                if (s2 < 0) {
                    s2 += 1;
                }
            }
            mash = null;
            var random = function() {
                var t = 2091639 * s0 + c * 2.3283064365386963e-10;
                // 2^-32
                s0 = s1;
                s1 = s2;
                return s2 = t - (c = t | 0);
            };
            random.uint32 = function() {
                return random() * 4294967296;
            };
            random.fract53 = function() {
                return random() + (random() * 2097152 | 0) * 1.1102230246251565e-16;
            };
            random.version = "Alea 0.9";
            random.args = args;
            return random;
        }(Array.prototype.slice.call(arguments));
    };
    var UNMISTAKABLE_CHARS = "23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz";
    var BASE64_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" + "0123456789-_";
    // If seeds are provided, then the alea PRNG will be used, since cryptographic
    // PRNGs (Node crypto and window.crypto.getRandomValues) don't allow us to
    // specify seeds. The caller is responsible for making sure to provide a seed
    // for alea if a csprng is not available.
    var RandomGenerator = function(seedArray) {
        var self = this;
        if (seedArray !== undefined) self.alea = Alea.apply(null, seedArray);
    };
    RandomGenerator.prototype.fraction = function() {
        var self = this;
        if (self.alea) {
            return self.alea();
        } else if (nodeCrypto) {
            var numerator = parseInt(self.hexString(8), 16);
            return numerator * 2.3283064365386963e-10;
        } else if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
            var array = new Uint32Array(1);
            window.crypto.getRandomValues(array);
            return array[0] * 2.3283064365386963e-10;
        } else {
            throw new Error("No random generator available");
        }
    };
    RandomGenerator.prototype.hexString = function(digits) {
        var self = this;
        if (nodeCrypto && !self.alea) {
            var numBytes = Math.ceil(digits / 2);
            var bytes;
            // Try to get cryptographically strong randomness. Fall back to
            // non-cryptographically strong if not available.
            try {
                bytes = nodeCrypto.randomBytes(numBytes);
            } catch (e) {
                // XXX should re-throw any error except insufficient entropy
                bytes = nodeCrypto.pseudoRandomBytes(numBytes);
            }
            var result = bytes.toString("hex");
            // If the number of digits is odd, we'll have generated an extra 4 bits
            // of randomness, so we need to trim the last digit.
            return result.substring(0, digits);
        } else {
            var hexDigits = [];
            for (var i = 0; i < digits; ++i) {
                hexDigits.push(self.choice("0123456789abcdef"));
            }
            return hexDigits.join("");
        }
    };
    RandomGenerator.prototype._randomString = function(charsCount, alphabet) {
        var self = this;
        var digits = [];
        for (var i = 0; i < charsCount; i++) {
            digits[i] = self.choice(alphabet);
        }
        return digits.join("");
    };
    RandomGenerator.prototype.id = function(charsCount) {
        var self = this;
        // 17 characters is around 96 bits of entropy, which is the amount of
        // state in the Alea PRNG.
        if (charsCount === undefined) charsCount = 17;
        return self._randomString(charsCount, UNMISTAKABLE_CHARS);
    };
    RandomGenerator.prototype.secret = function(charsCount) {
        var self = this;
        // Default to 256 bits of entropy, or 43 characters at 6 bits per
        // character.
        if (charsCount === undefined) charsCount = 43;
        return self._randomString(charsCount, BASE64_CHARS);
    };
    RandomGenerator.prototype.choice = function(arrayOrString) {
        var index = Math.floor(this.fraction() * arrayOrString.length);
        if (typeof arrayOrString === "string") return arrayOrString.substr(index, 1); else return arrayOrString[index];
    };
    // instantiate RNG.  Heuristically collect entropy from various sources when a
    // cryptographic PRNG isn't available.
    // client sources
    var height = typeof window !== "undefined" && window.innerHeight || typeof document !== "undefined" && document.documentElement && document.documentElement.clientHeight || typeof document !== "undefined" && document.body && document.body.clientHeight || 1;
    var width = typeof window !== "undefined" && window.innerWidth || typeof document !== "undefined" && document.documentElement && document.documentElement.clientWidth || typeof document !== "undefined" && document.body && document.body.clientWidth || 1;
    var agent = typeof navigator !== "undefined" && navigator.userAgent || "";
    if (nodeCrypto || typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) Random = new RandomGenerator(); else Random = new RandomGenerator([ new Date(), height, width, agent, Math.random() ]);
    Random.createWithSeeds = function() {
        if (arguments.length === 0) {
            throw new Error("No seeds were provided");
        }
        return new RandomGenerator(arguments);
    };
    // Define an object named exports. This will cause geojson-utils.js to put `gju`
    // as a field on it, instead of in the global namespace.  See also post.js.
    module = {
        exports: {}
    };
    (function() {
        var gju = {};
        // Export the geojson object for **CommonJS**
        if (typeof module !== "undefined" && module.exports) {
            module.exports = gju;
        }
        // adapted from http://www.kevlindev.com/gui/math/intersection/Intersection.js
        gju.lineStringsIntersect = function(l1, l2) {
            var intersects = [];
            for (var i = 0; i <= l1.coordinates.length - 2; ++i) {
                for (var j = 0; j <= l2.coordinates.length - 2; ++j) {
                    var a1 = {
                        x: l1.coordinates[i][1],
                        y: l1.coordinates[i][0]
                    }, a2 = {
                        x: l1.coordinates[i + 1][1],
                        y: l1.coordinates[i + 1][0]
                    }, b1 = {
                        x: l2.coordinates[j][1],
                        y: l2.coordinates[j][0]
                    }, b2 = {
                        x: l2.coordinates[j + 1][1],
                        y: l2.coordinates[j + 1][0]
                    }, ua_t = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x), ub_t = (a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x), u_b = (b2.y - b1.y) * (a2.x - a1.x) - (b2.x - b1.x) * (a2.y - a1.y);
                    if (u_b != 0) {
                        var ua = ua_t / u_b, ub = ub_t / u_b;
                        if (0 <= ua && ua <= 1 && 0 <= ub && ub <= 1) {
                            intersects.push({
                                type: "Point",
                                coordinates: [ a1.x + ua * (a2.x - a1.x), a1.y + ua * (a2.y - a1.y) ]
                            });
                        }
                    }
                }
            }
            if (intersects.length == 0) intersects = false;
            return intersects;
        };
        // Bounding Box
        function boundingBoxAroundPolyCoords(coords) {
            var xAll = [], yAll = [];
            for (var i = 0; i < coords[0].length; i++) {
                xAll.push(coords[0][i][1]);
                yAll.push(coords[0][i][0]);
            }
            xAll = xAll.sort(function(a, b) {
                return a - b;
            });
            yAll = yAll.sort(function(a, b) {
                return a - b;
            });
            return [ [ xAll[0], yAll[0] ], [ xAll[xAll.length - 1], yAll[yAll.length - 1] ] ];
        }
        gju.pointInBoundingBox = function(point, bounds) {
            return !(point.coordinates[1] < bounds[0][0] || point.coordinates[1] > bounds[1][0] || point.coordinates[0] < bounds[0][1] || point.coordinates[0] > bounds[1][1]);
        };
        // Point in Polygon
        // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html#Listing the Vertices
        function pnpoly(x, y, coords) {
            var vert = [ [ 0, 0 ] ];
            for (var i = 0; i < coords.length; i++) {
                for (var j = 0; j < coords[i].length; j++) {
                    vert.push(coords[i][j]);
                }
                vert.push([ 0, 0 ]);
            }
            var inside = false;
            for (var i = 0, j = vert.length - 1; i < vert.length; j = i++) {
                if (vert[i][0] > y != vert[j][0] > y && x < (vert[j][1] - vert[i][1]) * (y - vert[i][0]) / (vert[j][0] - vert[i][0]) + vert[i][1]) inside = !inside;
            }
            return inside;
        }
        gju.pointInPolygon = function(p, poly) {
            var coords = poly.type == "Polygon" ? [ poly.coordinates ] : poly.coordinates;
            var insideBox = false;
            for (var i = 0; i < coords.length; i++) {
                if (gju.pointInBoundingBox(p, boundingBoxAroundPolyCoords(coords[i]))) insideBox = true;
            }
            if (!insideBox) return false;
            var insidePoly = false;
            for (var i = 0; i < coords.length; i++) {
                if (pnpoly(p.coordinates[1], p.coordinates[0], coords[i])) insidePoly = true;
            }
            return insidePoly;
        };
        gju.numberToRadius = function(number) {
            return number * Math.PI / 180;
        };
        gju.numberToDegree = function(number) {
            return number * 180 / Math.PI;
        };
        // written with help from @tautologe
        gju.drawCircle = function(radiusInMeters, centerPoint, steps) {
            var center = [ centerPoint.coordinates[1], centerPoint.coordinates[0] ], dist = radiusInMeters / 1e3 / 6371, // convert meters to radiant
            radCenter = [ gju.numberToRadius(center[0]), gju.numberToRadius(center[1]) ], steps = steps || 15, // 15 sided circle
            poly = [ [ center[0], center[1] ] ];
            for (var i = 0; i < steps; i++) {
                var brng = 2 * Math.PI * i / steps;
                var lat = Math.asin(Math.sin(radCenter[0]) * Math.cos(dist) + Math.cos(radCenter[0]) * Math.sin(dist) * Math.cos(brng));
                var lng = radCenter[1] + Math.atan2(Math.sin(brng) * Math.sin(dist) * Math.cos(radCenter[0]), Math.cos(dist) - Math.sin(radCenter[0]) * Math.sin(lat));
                poly[i] = [];
                poly[i][1] = gju.numberToDegree(lat);
                poly[i][0] = gju.numberToDegree(lng);
            }
            return {
                type: "Polygon",
                coordinates: [ poly ]
            };
        };
        // assumes rectangle starts at lower left point
        gju.rectangleCentroid = function(rectangle) {
            var bbox = rectangle.coordinates[0];
            var xmin = bbox[0][0], ymin = bbox[0][1], xmax = bbox[2][0], ymax = bbox[2][1];
            var xwidth = xmax - xmin;
            var ywidth = ymax - ymin;
            return {
                type: "Point",
                coordinates: [ xmin + xwidth / 2, ymin + ywidth / 2 ]
            };
        };
        // from http://www.movable-type.co.uk/scripts/latlong.html
        gju.pointDistance = function(pt1, pt2) {
            var lon1 = pt1.coordinates[0], lat1 = pt1.coordinates[1], lon2 = pt2.coordinates[0], lat2 = pt2.coordinates[1], dLat = gju.numberToRadius(lat2 - lat1), dLon = gju.numberToRadius(lon2 - lon1), a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(gju.numberToRadius(lat1)) * Math.cos(gju.numberToRadius(lat2)) * Math.pow(Math.sin(dLon / 2), 2), c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            // Earth radius is 6371 km
            return 6371 * c * 1e3;
        }, // checks if geometry lies entirely within a circle
        // works with Point, LineString, Polygon
        gju.geometryWithinRadius = function(geometry, center, radius) {
            if (geometry.type == "Point") {
                return gju.pointDistance(geometry, center) <= radius;
            } else if (geometry.type == "LineString" || geometry.type == "Polygon") {
                var point = {};
                var coordinates;
                if (geometry.type == "Polygon") {
                    // it's enough to check the exterior ring of the Polygon
                    coordinates = geometry.coordinates[0];
                } else {
                    coordinates = geometry.coordinates;
                }
                for (var i in coordinates) {
                    point.coordinates = coordinates[i];
                    if (gju.pointDistance(point, center) > radius) {
                        return false;
                    }
                }
            }
            return true;
        };
        // adapted from http://paulbourke.net/geometry/polyarea/javascript.txt
        gju.area = function(polygon) {
            var area = 0;
            // TODO: polygon holes at coordinates[1]
            var points = polygon.coordinates[0];
            var j = points.length - 1;
            var p1, p2;
            for (var i = 0; i < points.length; j = i++) {
                var p1 = {
                    x: points[i][1],
                    y: points[i][0]
                };
                var p2 = {
                    x: points[j][1],
                    y: points[j][0]
                };
                area += p1.x * p2.y;
                area -= p1.y * p2.x;
            }
            area /= 2;
            return area;
        }, // adapted from http://paulbourke.net/geometry/polyarea/javascript.txt
        gju.centroid = function(polygon) {
            var f, x = 0, y = 0;
            // TODO: polygon holes at coordinates[1]
            var points = polygon.coordinates[0];
            var j = points.length - 1;
            var p1, p2;
            for (var i = 0; i < points.length; j = i++) {
                var p1 = {
                    x: points[i][1],
                    y: points[i][0]
                };
                var p2 = {
                    x: points[j][1],
                    y: points[j][0]
                };
                f = p1.x * p2.y - p2.x * p1.y;
                x += (p1.x + p2.x) * f;
                y += (p1.y + p2.y) * f;
            }
            f = gju.area(polygon) * 6;
            return {
                type: "Point",
                coordinates: [ y / f, x / f ]
            };
        }, gju.simplify = function(source, kink) {
            /* source[] array of geojson points */
            /* kink	in metres, kinks above this depth kept  */
            /* kink depth is the height of the triangle abc where a-b and b-c are two consecutive line segments */
            kink = kink || 20;
            source = source.map(function(o) {
                return {
                    lng: o.coordinates[0],
                    lat: o.coordinates[1]
                };
            });
            var n_source, n_stack, n_dest, start, end, i, sig;
            var dev_sqr, max_dev_sqr, band_sqr;
            var x12, y12, d12, x13, y13, d13, x23, y23, d23;
            var F = Math.PI / 180 * .5;
            var index = new Array();
            /* aray of indexes of source points to include in the reduced line */
            var sig_start = new Array();
            /* indices of start & end of working section */
            var sig_end = new Array();
            /* check for simple cases */
            if (source.length < 3) return source;
            /* one or two points */
            /* more complex case. initialize stack */
            n_source = source.length;
            band_sqr = kink * 360 / (2 * Math.PI * 6378137);
            /* Now in degrees */
            band_sqr *= band_sqr;
            n_dest = 0;
            sig_start[0] = 0;
            sig_end[0] = n_source - 1;
            n_stack = 1;
            /* while the stack is not empty  ... */
            while (n_stack > 0) {
                /* ... pop the top-most entries off the stacks */
                start = sig_start[n_stack - 1];
                end = sig_end[n_stack - 1];
                n_stack--;
                if (end - start > 1) {
                    /* any intermediate points ? */
                    /* ... yes, so find most deviant intermediate point to
        either side of line joining start & end points */
                    x12 = source[end].lng() - source[start].lng();
                    y12 = source[end].lat() - source[start].lat();
                    if (Math.abs(x12) > 180) x12 = 360 - Math.abs(x12);
                    x12 *= Math.cos(F * (source[end].lat() + source[start].lat()));
                    /* use avg lat to reduce lng */
                    d12 = x12 * x12 + y12 * y12;
                    for (i = start + 1, sig = start, max_dev_sqr = -1; i < end; i++) {
                        x13 = source[i].lng() - source[start].lng();
                        y13 = source[i].lat() - source[start].lat();
                        if (Math.abs(x13) > 180) x13 = 360 - Math.abs(x13);
                        x13 *= Math.cos(F * (source[i].lat() + source[start].lat()));
                        d13 = x13 * x13 + y13 * y13;
                        x23 = source[i].lng() - source[end].lng();
                        y23 = source[i].lat() - source[end].lat();
                        if (Math.abs(x23) > 180) x23 = 360 - Math.abs(x23);
                        x23 *= Math.cos(F * (source[i].lat() + source[end].lat()));
                        d23 = x23 * x23 + y23 * y23;
                        if (d13 >= d12 + d23) dev_sqr = d23; else if (d23 >= d12 + d13) dev_sqr = d13; else dev_sqr = (x13 * y12 - y13 * x12) * (x13 * y12 - y13 * x12) / d12;
                        // solve triangle
                        if (dev_sqr > max_dev_sqr) {
                            sig = i;
                            max_dev_sqr = dev_sqr;
                        }
                    }
                    if (max_dev_sqr < band_sqr) {
                        /* is there a sig. intermediate point ? */
                        /* ... no, so transfer current start point */
                        index[n_dest] = start;
                        n_dest++;
                    } else {
                        /* ... yes, so push two sub-sections on stack for further processing */
                        n_stack++;
                        sig_start[n_stack - 1] = sig;
                        sig_end[n_stack - 1] = end;
                        n_stack++;
                        sig_start[n_stack - 1] = start;
                        sig_end[n_stack - 1] = sig;
                    }
                } else {
                    /* ... no intermediate points, so transfer current start point */
                    index[n_dest] = start;
                    n_dest++;
                }
            }
            /* transfer last point */
            index[n_dest] = n_source - 1;
            n_dest++;
            /* make return array */
            var r = new Array();
            for (var i = 0; i < n_dest; i++) r.push(source[index[i]]);
            return r.map(function(o) {
                return {
                    type: "Point",
                    coordinates: [ o.lng, o.lat ]
                };
            });
        };
        // http://www.movable-type.co.uk/scripts/latlong.html#destPoint
        gju.destinationPoint = function(pt, brng, dist) {
            dist = dist / 6371;
            // convert dist to angular distance in radians
            brng = gju.numberToRadius(brng);
            var lat1 = gju.numberToRadius(pt.coordinates[0]);
            var lon1 = gju.numberToRadius(pt.coordinates[1]);
            var lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist) + Math.cos(lat1) * Math.sin(dist) * Math.cos(brng));
            var lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(dist) * Math.cos(lat1), Math.cos(dist) - Math.sin(lat1) * Math.sin(lat2));
            lon2 = (lon2 + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
            // normalise to -180..+180º
            return {
                type: "Point",
                coordinates: [ gju.numberToDegree(lat2), gju.numberToDegree(lon2) ]
            };
        };
    })();
    // This exports object was created in pre.js.  Now copy the `exports` object
    // from it into the package-scope variable `GeoJSON`, which will get exported.
    GeoJSON = module.exports;
    // XXX type checking on selectors (graceful error if malformed)
    // LocalCollection: a set of documents that supports queries and modifiers.
    // Cursor: a specification for a particular subset of documents, w/
    // a defined order, limit, and offset.  creating a Cursor with LocalCollection.find(),
    // ObserveHandle: the return value of a live query.
    LocalCollection = function(name) {
        var self = this;
        self.name = name;
        // _id -> document (also containing id)
        self._docs = new LocalCollection._IdMap();
        self._observeQueue = new Meteor._SynchronousQueue();
        self.next_qid = 1;
        // live query id generator
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
    LocalCollection._applyChanges = function(doc, changeFields) {
        _.each(changeFields, function(value, key) {
            if (value === undefined) delete doc[key]; else doc[key] = value;
        });
    };
    MinimongoError = function(message) {
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
    LocalCollection.prototype.find = function(selector, options) {
        // default syntax for everything is to omit the selector argument.
        // but if selector is explicitly passed in as false or undefined, we
        // want a selector that matches nothing.
        if (arguments.length === 0) selector = {};
        return new LocalCollection.Cursor(this, selector, options);
    };
    // don't call this ctor directly.  use LocalCollection.find().
    LocalCollection.Cursor = function(collection, selector, options) {
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
                self.sorter = new Minimongo.Sorter(options.sort || [], {
                    matcher: self.matcher
                });
            }
        }
        self.skip = options.skip;
        self.limit = options.limit;
        self.fields = options.fields;
        self._projectionFn = LocalCollection._compileProjection(self.fields || {});
        self._transform = LocalCollection.wrapTransform(options.transform);
        // by default, queries register w/ Tracker when it is available.
        if (typeof Tracker !== "undefined") self.reactive = options.reactive === undefined ? true : options.reactive;
    };
    // Since we don't actually have a "nextObject" interface, there's really no
    // reason to have a "rewind" interface.  All it did was make multiple calls
    // to fetch/map/forEach return nothing the second time.
    // XXX COMPAT WITH 0.8.1
    LocalCollection.Cursor.prototype.rewind = function() {};
    LocalCollection.prototype.findOne = function(selector, options) {
        if (arguments.length === 0) selector = {};
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
    LocalCollection.Cursor.prototype.forEach = function(callback, thisArg) {
        var self = this;
        var objects = self._getRawObjects({
            ordered: true
        });
        if (self.reactive) {
            self._depend({
                addedBefore: true,
                removed: true,
                changed: true,
                movedBefore: true
            });
        }
        _.each(objects, function(elt, i) {
            // This doubles as a clone operation.
            elt = self._projectionFn(elt);
            if (self._transform) elt = self._transform(elt);
            callback.call(thisArg, elt, i, self);
        });
    };
    LocalCollection.Cursor.prototype.getTransform = function() {
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
    LocalCollection.Cursor.prototype.map = function(callback, thisArg) {
        var self = this;
        var res = [];
        self.forEach(function(doc, index) {
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
    LocalCollection.Cursor.prototype.fetch = function() {
        var self = this;
        var res = [];
        self.forEach(function(doc) {
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
    LocalCollection.Cursor.prototype.count = function() {
        var self = this;
        if (self.reactive) self._depend({
            added: true,
            removed: true
        }, true);
        return self._getRawObjects({
            ordered: true
        }).length;
    };
    LocalCollection.Cursor.prototype._publishCursor = function(sub) {
        var self = this;
        if (!self.collection.name) throw new Error("Can't publish a cursor from a collection without a name.");
        var collection = self.collection.name;
        // XXX minimongo should not depend on mongo-livedata!
        return Mongo.Collection._publishCursor(self, sub, collection);
    };
    LocalCollection.Cursor.prototype._getCollectionName = function() {
        var self = this;
        return self.collection.name;
    };
    LocalCollection._observeChangesCallbacksAreOrdered = function(callbacks) {
        if (callbacks.added && callbacks.addedBefore) throw new Error("Please specify only one of added() and addedBefore()");
        return !!(callbacks.addedBefore || callbacks.movedBefore);
    };
    LocalCollection._observeCallbacksAreOrdered = function(callbacks) {
        if (callbacks.addedAt && callbacks.added) throw new Error("Please specify only one of added() and addedAt()");
        if (callbacks.changedAt && callbacks.changed) throw new Error("Please specify only one of changed() and changedAt()");
        if (callbacks.removed && callbacks.removedAt) throw new Error("Please specify only one of removed() and removedAt()");
        return !!(callbacks.addedAt || callbacks.movedTo || callbacks.changedAt || callbacks.removedAt);
    };
    // the handle that comes back from observe.
    LocalCollection.ObserveHandle = function() {};
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
        observe: function(options) {
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
        observeChanges: function(options) {
            var self = this;
            var ordered = LocalCollection._observeChangesCallbacksAreOrdered(options);
            // there are several places that assume you aren't combining skip/limit with
            // unordered observe.  eg, update's EJSON.clone, and the "there are several"
            // comment in _modifyAndNotify
            // XXX allow skip/limit with unordered observe
            if (!options._allow_unordered && !ordered && (self.skip || self.limit)) throw new Error("must use ordered observe (ie, 'addedBefore' instead of 'added') with skip or limit");
            if (self.fields && (self.fields._id === 0 || self.fields._id === false)) throw Error("You may not observe a cursor with {fields: {_id: 0}}");
            var query = {
                matcher: self.matcher,
                // not fast pathed
                sorter: ordered && self.sorter,
                distances: self.matcher.hasGeoQuery() && ordered && new LocalCollection._IdMap(),
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
                ordered: ordered,
                distances: query.distances
            });
            if (self.collection.paused) query.resultsSnapshot = ordered ? [] : new LocalCollection._IdMap();
            // wrap callbacks we were passed. callbacks only fire when not paused and
            // are never undefined
            // Filters out blacklisted fields according to cursor's projection.
            // XXX wrong place for this?
            // furthermore, callbacks enqueue until the operation we're working on is
            // done.
            var wrapCallback = function(f) {
                if (!f) return function() {};
                return function() {
                    var context = this;
                    var args = arguments;
                    if (self.collection.paused) return;
                    self.collection._observeQueue.queueTask(function() {
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
                var each = ordered ? _.bind(_.each, null, query.results) : _.bind(query.results.forEach, query.results);
                each(function(doc) {
                    var fields = EJSON.clone(doc);
                    delete fields._id;
                    if (ordered) query.addedBefore(doc._id, self._projectionFn(fields), null);
                    query.added(doc._id, self._projectionFn(fields));
                });
            }
            var handle = new LocalCollection.ObserveHandle();
            _.extend(handle, {
                collection: self.collection,
                stop: function() {
                    if (self.reactive) delete self.collection.queries[qid];
                }
            });
            if (self.reactive && Tracker.active) {
                // XXX in many cases, the same observe will be recreated when
                // the current autorun is rerun.  we could save work by
                // letting it linger across rerun and potentially get
                // repurposed if the same observe is performed, using logic
                // similar to that of Meteor.subscribe.
                Tracker.onInvalidate(function() {
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
    LocalCollection.Cursor.prototype._getRawObjects = function(options) {
        var self = this;
        options = options || {};
        // XXX use OrderedDict instead of array, and make IdMap and OrderedDict
        // compatible
        var results = options.ordered ? [] : new LocalCollection._IdMap();
        // fast path for single ID value
        if (self._selectorId !== undefined) {
            // If you have non-zero skip and ask for a single id, you get
            // nothing. This is so it matches the behavior of the '{_id: foo}'
            // path.
            if (self.skip) return results;
            var selectedDoc = self.collection._docs.get(self._selectorId);
            if (selectedDoc) {
                if (options.ordered) results.push(selectedDoc); else results.set(self._selectorId, selectedDoc);
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
        self.collection._docs.forEach(function(doc, id) {
            var matchResult = self.matcher.documentMatches(doc);
            if (matchResult.result) {
                if (options.ordered) {
                    results.push(doc);
                    if (distances && matchResult.distance !== undefined) distances.set(id, matchResult.distance);
                } else {
                    results.set(id, doc);
                }
            }
            // Fast path for limited unsorted queries.
            // XXX 'length' check here seems wrong for ordered
            if (self.limit && !self.skip && !self.sorter && results.length === self.limit) return false;
            // break
            return true;
        });
        if (!options.ordered) return results;
        if (self.sorter) {
            var comparator = self.sorter.getComparator({
                distances: distances
            });
            results.sort(comparator);
        }
        var idx_start = self.skip || 0;
        var idx_end = self.limit ? self.limit + idx_start : results.length;
        return results.slice(idx_start, idx_end);
    };
    // XXX Maybe we need a version of observe that just calls a callback if
    // anything changed.
    LocalCollection.Cursor.prototype._depend = function(changers, _allow_unordered) {
        var self = this;
        if (Tracker.active) {
            var v = new Tracker.Dependency();
            v.depend();
            var notifyChange = _.bind(v.changed, v);
            var options = {
                _suppress_initial: true,
                _allow_unordered: _allow_unordered
            };
            _.each([ "added", "changed", "removed", "addedBefore", "movedBefore" ], function(fnName) {
                if (changers[fnName]) options[fnName] = notifyChange;
            });
            // observeChanges will stop() when this computation is invalidated
            self.observeChanges(options);
        }
    };
    // XXX enforce rule that field names can't start with '$' or contain '.'
    // (real mongodb does in fact enforce this)
    // XXX possibly enforce that 'undefined' does not appear (we assume
    // this in our handling of null and $exists)
    LocalCollection.prototype.insert = function(doc, callback) {
        var self = this;
        doc = EJSON.clone(doc);
        if (!_.has(doc, "_id")) {
            // if you really want to use ObjectIDs, set this global.
            // Mongo.Collection specifies its own ids and does not use this code.
            doc._id = LocalCollection._useOID ? new LocalCollection._ObjectID() : Random.id();
        }
        var id = doc._id;
        if (self._docs.has(id)) throw MinimongoError("Duplicate _id '" + id + "'");
        self._saveOriginal(id, undefined);
        self._docs.set(id, doc);
        var queriesToRecompute = [];
        // trigger live queries that match
        for (var qid in self.queries) {
            var query = self.queries[qid];
            var matchResult = query.matcher.documentMatches(doc);
            if (matchResult.result) {
                if (query.distances && matchResult.distance !== undefined) query.distances.set(id, matchResult.distance);
                if (query.cursor.skip || query.cursor.limit) queriesToRecompute.push(qid); else LocalCollection._insertInResults(query, doc);
            }
        }
        _.each(queriesToRecompute, function(qid) {
            if (self.queries[qid]) self._recomputeResults(self.queries[qid]);
        });
        self._observeQueue.drain();
        // Defer because the caller likely doesn't expect the callback to be run
        // immediately.
        if (callback) Meteor.defer(function() {
            callback(null, id);
        });
        return id;
    };
    // Iterates over a subset of documents that could match selector; calls
    // f(doc, id) on each of them.  Specifically, if selector specifies
    // specific _id's, it only looks at those.  doc is *not* cloned: it is the
    // same object that is in _docs.
    LocalCollection.prototype._eachPossiblyMatchingDoc = function(selector, f) {
        var self = this;
        var specificIds = LocalCollection._idsMatchedBySelector(selector);
        if (specificIds) {
            for (var i = 0; i < specificIds.length; ++i) {
                var id = specificIds[i];
                var doc = self._docs.get(id);
                if (doc) {
                    var breakIfFalse = f(doc, id);
                    if (breakIfFalse === false) break;
                }
            }
        } else {
            self._docs.forEach(f);
        }
    };
    LocalCollection.prototype.remove = function(selector, callback) {
        var self = this;
        // Easy special case: if we're not calling observeChanges callbacks and we're
        // not saving originals and we got asked to remove everything, then just empty
        // everything directly.
        if (self.paused && !self._savedOriginals && EJSON.equals(selector, {})) {
            var result = self._docs.size();
            self._docs.clear();
            _.each(self.queries, function(query) {
                if (query.ordered) {
                    query.results = [];
                } else {
                    query.results.clear();
                }
            });
            if (callback) {
                Meteor.defer(function() {
                    callback(null, result);
                });
            }
            return result;
        }
        var matcher = new Minimongo.Matcher(selector);
        var remove = [];
        self._eachPossiblyMatchingDoc(selector, function(doc, id) {
            if (matcher.documentMatches(doc).result) remove.push(id);
        });
        var queriesToRecompute = [];
        var queryRemove = [];
        for (var i = 0; i < remove.length; i++) {
            var removeId = remove[i];
            var removeDoc = self._docs.get(removeId);
            _.each(self.queries, function(query, qid) {
                if (query.matcher.documentMatches(removeDoc).result) {
                    if (query.cursor.skip || query.cursor.limit) queriesToRecompute.push(qid); else queryRemove.push({
                        qid: qid,
                        doc: removeDoc
                    });
                }
            });
            self._saveOriginal(removeId, removeDoc);
            self._docs.remove(removeId);
        }
        // run live query callbacks _after_ we've removed the documents.
        _.each(queryRemove, function(remove) {
            var query = self.queries[remove.qid];
            if (query) {
                query.distances && query.distances.remove(remove.doc._id);
                LocalCollection._removeFromResults(query, remove.doc);
            }
        });
        _.each(queriesToRecompute, function(qid) {
            var query = self.queries[qid];
            if (query) self._recomputeResults(query);
        });
        self._observeQueue.drain();
        result = remove.length;
        if (callback) Meteor.defer(function() {
            callback(null, result);
        });
        return result;
    };
    // XXX atomicity: if multi is true, and one modification fails, do
    // we rollback the whole operation, or what?
    LocalCollection.prototype.update = function(selector, mod, options, callback) {
        var self = this;
        if (!callback && options instanceof Function) {
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
        _.each(self.queries, function(query, qid) {
            // XXX for now, skip/limit implies ordered observe, so query.results is
            // always an array
            if ((query.cursor.skip || query.cursor.limit) && !self.paused) qidToOriginalResults[qid] = EJSON.clone(query.results);
        });
        var recomputeQids = {};
        var updateCount = 0;
        self._eachPossiblyMatchingDoc(selector, function(doc, id) {
            var queryResult = matcher.documentMatches(doc);
            if (queryResult.result) {
                // XXX Should we save the original even if mod ends up being a no-op?
                self._saveOriginal(id, doc);
                self._modifyAndNotify(doc, mod, recomputeQids, queryResult.arrayIndices);
                ++updateCount;
                if (!options.multi) return false;
            }
            return true;
        });
        _.each(recomputeQids, function(dummy, qid) {
            var query = self.queries[qid];
            if (query) self._recomputeResults(query, qidToOriginalResults[qid]);
        });
        self._observeQueue.drain();
        // If we are doing an upsert, and we didn't modify any documents yet, then
        // it's time to do an insert. Figure out what document we are inserting, and
        // generate an id for it.
        var insertedId;
        if (updateCount === 0 && options.upsert) {
            var newDoc = LocalCollection._removeDollarOperators(selector);
            LocalCollection._modify(newDoc, mod, {
                isInsert: true
            });
            if (!newDoc._id && options.insertedId) newDoc._id = options.insertedId;
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
            if (insertedId !== undefined) result.insertedId = insertedId;
        } else {
            result = updateCount;
        }
        if (callback) Meteor.defer(function() {
            callback(null, result);
        });
        return result;
    };
    // A convenience wrapper on update. LocalCollection.upsert(sel, mod) is
    // equivalent to LocalCollection.update(sel, mod, { upsert: true, _returnObject:
    // true }).
    LocalCollection.prototype.upsert = function(selector, mod, options, callback) {
        var self = this;
        if (!callback && typeof options === "function") {
            callback = options;
            options = {};
        }
        return self.update(selector, mod, _.extend({}, options, {
            upsert: true,
            _returnObject: true
        }), callback);
    };
    LocalCollection.prototype._modifyAndNotify = function(doc, mod, recomputeQids, arrayIndices) {
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
        LocalCollection._modify(doc, mod, {
            arrayIndices: arrayIndices
        });
        for (qid in self.queries) {
            query = self.queries[qid];
            var before = matched_before[qid];
            var afterMatch = query.matcher.documentMatches(doc);
            var after = afterMatch.result;
            if (after && query.distances && afterMatch.distance !== undefined) query.distances.set(doc._id, afterMatch.distance);
            if (query.cursor.skip || query.cursor.limit) {
                // We need to recompute any query where the doc may have been in the
                // cursor's window either before or after the update. (Note that if skip
                // or limit is set, "before" and "after" being true do not necessarily
                // mean that the document is in the cursor's output after skip/limit is
                // applied... but if they are false, then the document definitely is NOT
                // in the output. So it's safe to skip recompute if neither before or
                // after are true.)
                if (before || after) recomputeQids[qid] = true;
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
    LocalCollection._insertInResults = function(query, doc) {
        var fields = EJSON.clone(doc);
        delete fields._id;
        if (query.ordered) {
            if (!query.sorter) {
                query.addedBefore(doc._id, query.projectionFn(fields), null);
                query.results.push(doc);
            } else {
                var i = LocalCollection._insertInSortedList(query.sorter.getComparator({
                    distances: query.distances
                }), query.results, doc);
                var next = query.results[i + 1];
                if (next) next = next._id; else next = null;
                query.addedBefore(doc._id, query.projectionFn(fields), next);
            }
            query.added(doc._id, query.projectionFn(fields));
        } else {
            query.added(doc._id, query.projectionFn(fields));
            query.results.set(doc._id, doc);
        }
    };
    LocalCollection._removeFromResults = function(query, doc) {
        if (query.ordered) {
            var i = LocalCollection._findInOrderedResults(query, doc);
            query.removed(doc._id);
            query.results.splice(i, 1);
        } else {
            var id = doc._id;
            // in case callback mutates doc
            query.removed(doc._id);
            query.results.remove(id);
        }
    };
    LocalCollection._updateInResults = function(query, doc, old_doc) {
        if (!EJSON.equals(doc._id, old_doc._id)) throw new Error("Can't change a doc's _id while updating");
        var projectionFn = query.projectionFn;
        var changedFields = LocalCollection._makeChangedFields(projectionFn(doc), projectionFn(old_doc));
        if (!query.ordered) {
            if (!_.isEmpty(changedFields)) {
                query.changed(doc._id, changedFields);
                query.results.set(doc._id, doc);
            }
            return;
        }
        var orig_idx = LocalCollection._findInOrderedResults(query, doc);
        if (!_.isEmpty(changedFields)) query.changed(doc._id, changedFields);
        if (!query.sorter) return;
        // just take it out and put it back in again, and see if the index
        // changes
        query.results.splice(orig_idx, 1);
        var new_idx = LocalCollection._insertInSortedList(query.sorter.getComparator({
            distances: query.distances
        }), query.results, doc);
        if (orig_idx !== new_idx) {
            var next = query.results[new_idx + 1];
            if (next) next = next._id; else next = null;
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
    LocalCollection.prototype._recomputeResults = function(query, oldResults) {
        var self = this;
        if (!self.paused && !oldResults) oldResults = query.results;
        if (query.distances) query.distances.clear();
        query.results = query.cursor._getRawObjects({
            ordered: query.ordered,
            distances: query.distances
        });
        if (!self.paused) {
            LocalCollection._diffQueryChanges(query.ordered, oldResults, query.results, query, {
                projectionFn: query.projectionFn
            });
        }
    };
    LocalCollection._findInOrderedResults = function(query, doc) {
        if (!query.ordered) throw new Error("Can't call _findInOrderedResults on unordered query");
        for (var i = 0; i < query.results.length; i++) if (query.results[i] === doc) return i;
        throw Error("object missing from query");
    };
    // This binary search puts a value between any equal values, and the first
    // lesser value.
    LocalCollection._binarySearch = function(cmp, array, value) {
        var first = 0, rangeLength = array.length;
        while (rangeLength > 0) {
            var halfRange = Math.floor(rangeLength / 2);
            if (cmp(value, array[first + halfRange]) >= 0) {
                first += halfRange + 1;
                rangeLength -= halfRange + 1;
            } else {
                rangeLength = halfRange;
            }
        }
        return first;
    };
    LocalCollection._insertInSortedList = function(cmp, array, value) {
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
    LocalCollection.prototype.saveOriginals = function() {
        var self = this;
        if (self._savedOriginals) throw new Error("Called saveOriginals twice without retrieveOriginals");
        self._savedOriginals = new LocalCollection._IdMap();
    };
    LocalCollection.prototype.retrieveOriginals = function() {
        var self = this;
        if (!self._savedOriginals) throw new Error("Called retrieveOriginals without saveOriginals");
        var originals = self._savedOriginals;
        self._savedOriginals = null;
        return originals;
    };
    LocalCollection.prototype._saveOriginal = function(id, doc) {
        var self = this;
        // Are we even trying to save originals?
        if (!self._savedOriginals) return;
        // Have we previously mutated the original (and so 'doc' is not actually
        // original)?  (Note the 'has' check rather than truth: we store undefined
        // here for inserted docs!)
        if (self._savedOriginals.has(id)) return;
        self._savedOriginals.set(id, EJSON.clone(doc));
    };
    // Pause the observers. No callbacks from observers will fire until
    // 'resumeObservers' is called.
    LocalCollection.prototype.pauseObservers = function() {
        // No-op if already paused.
        if (this.paused) return;
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
    LocalCollection.prototype.resumeObservers = function() {
        var self = this;
        // No-op if not paused.
        if (!this.paused) return;
        // Unset the 'paused' flag. Make sure to do this first, otherwise
        // observer methods won't actually fire when we trigger them.
        this.paused = false;
        for (var qid in this.queries) {
            var query = self.queries[qid];
            // Diff the current results against the snapshot and send to observers.
            // pass the query object for its observer callbacks.
            LocalCollection._diffQueryChanges(query.ordered, query.resultsSnapshot, query.results, query, {
                projectionFn: query.projectionFn
            });
            query.resultsSnapshot = null;
        }
        self._observeQueue.drain();
    };
    // NB: used by livedata
    LocalCollection._idStringify = function(id) {
        if (id instanceof LocalCollection._ObjectID) {
            return id.valueOf();
        } else if (typeof id === "string") {
            if (id === "") {
                return id;
            } else if (id.substr(0, 1) === "-" || // escape previously dashed strings
            id.substr(0, 1) === "~" || // escape escaped numbers, true, false
            LocalCollection._looksLikeObjectID(id) || // escape object-id-form strings
            id.substr(0, 1) === "{") {
                // escape object-form strings, for maybe implementing later
                return "-" + id;
            } else {
                return id;
            }
        } else if (id === undefined) {
            return "-";
        } else if (typeof id === "object" && id !== null) {
            throw new Error("Meteor does not currently support objects other than ObjectID as ids");
        } else {
            // Numbers, true, false, null
            return "~" + JSON.stringify(id);
        }
    };
    // NB: used by livedata
    LocalCollection._idParse = function(id) {
        if (id === "") {
            return id;
        } else if (id === "-") {
            return undefined;
        } else if (id.substr(0, 1) === "-") {
            return id.substr(1);
        } else if (id.substr(0, 1) === "~") {
            return JSON.parse(id.substr(1));
        } else if (LocalCollection._looksLikeObjectID(id)) {
            return new LocalCollection._ObjectID(id);
        } else {
            return id;
        }
    };
    LocalCollection._makeChangedFields = function(newDoc, oldDoc) {
        var fields = {};
        LocalCollection._diffObjects(oldDoc, newDoc, {
            leftOnly: function(key, value) {
                fields[key] = undefined;
            },
            rightOnly: function(key, value) {
                fields[key] = value;
            },
            both: function(key, leftValue, rightValue) {
                if (!EJSON.equals(leftValue, rightValue)) fields[key] = rightValue;
            }
        });
        return fields;
    };
    // Wrap a transform function to return objects that have the _id field
    // of the untransformed document. This ensures that subsystems such as
    // the observe-sequence package that call `observe` can keep track of
    // the documents identities.
    //
    // - Require that it returns objects
    // - If the return value has an _id field, verify that it matches the
    //   original _id field
    // - If the return value doesn't have an _id field, add it back.
    LocalCollection.wrapTransform = function(transform) {
        if (!transform) return null;
        // No need to doubly-wrap transforms.
        if (transform.__wrappedTransform__) return transform;
        var wrapped = function(doc) {
            if (!_.has(doc, "_id")) {
                // XXX do we ever have a transform on the oplog's collection? because that
                // collection has no _id.
                throw new Error("can only transform documents with _id");
            }
            var id = doc._id;
            // XXX consider making tracker a weak dependency and checking Package.tracker here
            var transformed = Tracker.nonreactive(function() {
                return transform(doc);
            });
            if (!isPlainObject(transformed)) {
                throw new Error("transform must return object");
            }
            if (_.has(transformed, "_id")) {
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
    // Like _.isArray, but doesn't regard polyfilled Uint8Arrays on old browsers as
    // arrays.
    // XXX maybe this should be EJSON.isArray
    isArray = function(x) {
        return _.isArray(x) && !EJSON.isBinary(x);
    };
    // XXX maybe this should be EJSON.isObject, though EJSON doesn't know about
    // RegExp
    // XXX note that _type(undefined) === 3!!!!
    isPlainObject = LocalCollection._isPlainObject = function(x) {
        return x && LocalCollection._f._type(x) === 3;
    };
    isIndexable = function(x) {
        return isArray(x) || isPlainObject(x);
    };
    // Returns true if this is an object with at least one key and all keys begin
    // with $.  Unless inconsistentOK is set, throws if some keys begin with $ and
    // others don't.
    isOperatorObject = function(valueSelector, inconsistentOK) {
        if (!isPlainObject(valueSelector)) return false;
        var theseAreOperators = undefined;
        _.each(valueSelector, function(value, selKey) {
            var thisIsOperator = selKey.substr(0, 1) === "$";
            if (theseAreOperators === undefined) {
                theseAreOperators = thisIsOperator;
            } else if (theseAreOperators !== thisIsOperator) {
                if (!inconsistentOK) throw new Error("Inconsistent operator: " + JSON.stringify(valueSelector));
                theseAreOperators = false;
            }
        });
        return !!theseAreOperators;
    };
    // string can be converted to integer
    isNumericKey = function(s) {
        return /^[0-9]+$/.test(s);
    };
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
    Minimongo.Matcher = function(selector) {
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
        documentMatches: function(doc) {
            if (!doc || typeof doc !== "object") {
                throw Error("documentMatches needs a document");
            }
            return this._docMatcher(doc);
        },
        hasGeoQuery: function() {
            return this._hasGeoQuery;
        },
        hasWhere: function() {
            return this._hasWhere;
        },
        isSimple: function() {
            return this._isSimple;
        },
        // Given a selector, return a function that takes one argument, a
        // document. It returns a result object.
        _compileSelector: function(selector) {
            var self = this;
            // you can pass a literal function instead of a selector
            if (selector instanceof Function) {
                self._isSimple = false;
                self._selector = selector;
                self._recordPathUsed("");
                return function(doc) {
                    return {
                        result: !!selector.call(doc)
                    };
                };
            }
            // shorthand -- scalars match _id
            if (LocalCollection._selectorIsId(selector)) {
                self._selector = {
                    _id: selector
                };
                self._recordPathUsed("_id");
                return function(doc) {
                    return {
                        result: EJSON.equals(doc._id, selector)
                    };
                };
            }
            // protect against dangerous selectors.  falsey and {_id: falsey} are both
            // likely programmer error, and not what you want, particularly for
            // destructive operations.
            if (!selector || "_id" in selector && !selector._id) {
                self._isSimple = false;
                return nothingMatcher;
            }
            // Top level can't be an array or true or binary.
            if (typeof selector === "boolean" || isArray(selector) || EJSON.isBinary(selector)) throw new Error("Invalid selector: " + selector);
            self._selector = EJSON.clone(selector);
            return compileDocumentSelector(selector, self, {
                isRoot: true
            });
        },
        _recordPathUsed: function(path) {
            this._paths[path] = true;
        },
        // Returns a list of key paths the given selector is looking for. It includes
        // the empty string if there is a $where.
        _getPaths: function() {
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
    var compileDocumentSelector = function(docSelector, matcher, options) {
        options = options || {};
        var docMatchers = [];
        _.each(docSelector, function(subSelector, key) {
            if (key.substr(0, 1) === "$") {
                // Outer operators are either logical operators (they recurse back into
                // this function), or $where.
                if (!_.has(LOGICAL_OPERATORS, key)) throw new Error("Unrecognized logical operator: " + key);
                matcher._isSimple = false;
                docMatchers.push(LOGICAL_OPERATORS[key](subSelector, matcher, options.inElemMatch));
            } else {
                // Record this path, but only if we aren't in an elemMatcher, since in an
                // elemMatch this is a path inside an object in an array, not in the doc
                // root.
                if (!options.inElemMatch) matcher._recordPathUsed(key);
                var lookUpByIndex = makeLookupFunction(key);
                var valueMatcher = compileValueSelector(subSelector, matcher, options.isRoot);
                docMatchers.push(function(doc) {
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
    var compileValueSelector = function(valueSelector, matcher, isRoot) {
        if (valueSelector instanceof RegExp) {
            matcher._isSimple = false;
            return convertElementMatcherToBranchedMatcher(regexpElementMatcher(valueSelector));
        } else if (isOperatorObject(valueSelector)) {
            return operatorBranchedMatcher(valueSelector, matcher, isRoot);
        } else {
            return convertElementMatcherToBranchedMatcher(equalityElementMatcher(valueSelector));
        }
    };
    // Given an element matcher (which evaluates a single value), returns a branched
    // value (which evaluates the element matcher on all the branches and returns a
    // more structured return value possibly including arrayIndices).
    var convertElementMatcherToBranchedMatcher = function(elementMatcher, options) {
        options = options || {};
        return function(branches) {
            var expanded = branches;
            if (!options.dontExpandLeafArrays) {
                expanded = expandArraysInBranches(branches, options.dontIncludeLeafArrays);
            }
            var ret = {};
            ret.result = _.any(expanded, function(element) {
                var matched = elementMatcher(element.value);
                // Special case for $elemMatch: it means "true, and use this as an array
                // index if I didn't already have one".
                if (typeof matched === "number") {
                    // XXX This code dates from when we only stored a single array index
                    // (for the outermost array). Should we be also including deeper array
                    // indices from the $elemMatch match?
                    if (!element.arrayIndices) element.arrayIndices = [ matched ];
                    matched = true;
                }
                // If some element matched, and it's tagged with array indices, include
                // those indices in our result object.
                if (matched && element.arrayIndices) ret.arrayIndices = element.arrayIndices;
                return matched;
            });
            return ret;
        };
    };
    // Takes a RegExp object and returns an element matcher.
    regexpElementMatcher = function(regexp) {
        return function(value) {
            if (value instanceof RegExp) {
                // Comparing two regexps means seeing if the regexps are identical
                // (really!). Underscore knows how.
                return _.isEqual(value, regexp);
            }
            // Regexps only work against strings.
            if (typeof value !== "string") return false;
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
    equalityElementMatcher = function(elementSelector) {
        if (isOperatorObject(elementSelector)) throw Error("Can't create equalityValueSelector for operator object");
        // Special-case: null and undefined are equal (if you got undefined in there
        // somewhere, or if you got it due to some branch being non-existent in the
        // weird special case), even though they aren't with EJSON.equals.
        if (elementSelector == null) {
            // undefined or null
            return function(value) {
                return value == null;
            };
        }
        return function(value) {
            return LocalCollection._f._equal(elementSelector, value);
        };
    };
    // Takes an operator object (an object with $ keys) and returns a branched
    // matcher for it.
    var operatorBranchedMatcher = function(valueSelector, matcher, isRoot) {
        // Each valueSelector works separately on the various branches.  So one
        // operator can match one branch and another can match another branch.  This
        // is OK.
        var operatorMatchers = [];
        _.each(valueSelector, function(operand, operator) {
            // XXX we should actually implement $eq, which is new in 2.6
            var simpleRange = _.contains([ "$lt", "$lte", "$gt", "$gte" ], operator) && _.isNumber(operand);
            var simpleInequality = operator === "$ne" && !_.isObject(operand);
            var simpleInclusion = _.contains([ "$in", "$nin" ], operator) && _.isArray(operand) && !_.any(operand, _.isObject);
            if (!(operator === "$eq" || simpleRange || simpleInclusion || simpleInequality)) {
                matcher._isSimple = false;
            }
            if (_.has(VALUE_OPERATORS, operator)) {
                operatorMatchers.push(VALUE_OPERATORS[operator](operand, valueSelector, matcher, isRoot));
            } else if (_.has(ELEMENT_OPERATORS, operator)) {
                var options = ELEMENT_OPERATORS[operator];
                operatorMatchers.push(convertElementMatcherToBranchedMatcher(options.compileElementSelector(operand, valueSelector, matcher), options));
            } else {
                throw new Error("Unrecognized operator: " + operator);
            }
        });
        return andBranchedMatchers(operatorMatchers);
    };
    var compileArrayOfDocumentSelectors = function(selectors, matcher, inElemMatch) {
        if (!isArray(selectors) || _.isEmpty(selectors)) throw Error("$and/$or/$nor must be nonempty array");
        return _.map(selectors, function(subSelector) {
            if (!isPlainObject(subSelector)) throw Error("$or/$and/$nor entries need to be full objects");
            return compileDocumentSelector(subSelector, matcher, {
                inElemMatch: inElemMatch
            });
        });
    };
    // Operators that appear at the top level of a document selector.
    var LOGICAL_OPERATORS = {
        $and: function(subSelector, matcher, inElemMatch) {
            var matchers = compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch);
            return andDocumentMatchers(matchers);
        },
        $or: function(subSelector, matcher, inElemMatch) {
            var matchers = compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch);
            // Special case: if there is only one matcher, use it directly, *preserving*
            // any arrayIndices it returns.
            if (matchers.length === 1) return matchers[0];
            return function(doc) {
                var result = _.any(matchers, function(f) {
                    return f(doc).result;
                });
                // $or does NOT set arrayIndices when it has multiple
                // sub-expressions. (Tested against MongoDB.)
                return {
                    result: result
                };
            };
        },
        $nor: function(subSelector, matcher, inElemMatch) {
            var matchers = compileArrayOfDocumentSelectors(subSelector, matcher, inElemMatch);
            return function(doc) {
                var result = _.all(matchers, function(f) {
                    return !f(doc).result;
                });
                // Never set arrayIndices, because we only match if nothing in particular
                // "matched" (and because this is consistent with MongoDB).
                return {
                    result: result
                };
            };
        },
        $where: function(selectorValue, matcher) {
            // Record that *any* path may be used.
            matcher._recordPathUsed("");
            matcher._hasWhere = true;
            if (!(selectorValue instanceof Function)) {
                // XXX MongoDB seems to have more complex logic to decide where or or not
                // to add "return"; not sure exactly what it is.
                selectorValue = Function("obj", "return " + selectorValue);
            }
            return function(doc) {
                // We make the document available as both `this` and `obj`.
                // XXX not sure what we should do if this throws
                return {
                    result: selectorValue.call(doc, doc)
                };
            };
        },
        // This is just used as a comment in the query (in MongoDB, it also ends up in
        // query logs); it has no effect on the actual selection.
        $comment: function() {
            return function() {
                return {
                    result: true
                };
            };
        }
    };
    // Returns a branched matcher that matches iff the given matcher does not.
    // Note that this implicitly "deMorganizes" the wrapped function.  ie, it
    // means that ALL branch values need to fail to match innerBranchedMatcher.
    var invertBranchedMatcher = function(branchedMatcher) {
        return function(branchValues) {
            var invertMe = branchedMatcher(branchValues);
            // We explicitly choose to strip arrayIndices here: it doesn't make sense to
            // say "update the array element that does not match something", at least
            // in mongo-land.
            return {
                result: !invertMe.result
            };
        };
    };
    // Operators that (unlike LOGICAL_OPERATORS) pertain to individual paths in a
    // document, but (unlike ELEMENT_OPERATORS) do not have a simple definition as
    // "match each branched value independently and combine with
    // convertElementMatcherToBranchedMatcher".
    var VALUE_OPERATORS = {
        $not: function(operand, valueSelector, matcher) {
            return invertBranchedMatcher(compileValueSelector(operand, matcher));
        },
        $ne: function(operand) {
            return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(equalityElementMatcher(operand)));
        },
        $nin: function(operand) {
            return invertBranchedMatcher(convertElementMatcherToBranchedMatcher(ELEMENT_OPERATORS.$in.compileElementSelector(operand)));
        },
        $exists: function(operand) {
            var exists = convertElementMatcherToBranchedMatcher(function(value) {
                return value !== undefined;
            });
            return operand ? exists : invertBranchedMatcher(exists);
        },
        // $options just provides options for $regex; its logic is inside $regex
        $options: function(operand, valueSelector) {
            if (!_.has(valueSelector, "$regex")) throw Error("$options needs a $regex");
            return everythingMatcher;
        },
        // $maxDistance is basically an argument to $near
        $maxDistance: function(operand, valueSelector) {
            if (!valueSelector.$near) throw Error("$maxDistance needs a $near");
            return everythingMatcher;
        },
        $all: function(operand, valueSelector, matcher) {
            if (!isArray(operand)) throw Error("$all requires array");
            // Not sure why, but this seems to be what MongoDB does.
            if (_.isEmpty(operand)) return nothingMatcher;
            var branchedMatchers = [];
            _.each(operand, function(criterion) {
                // XXX handle $all/$elemMatch combination
                if (isOperatorObject(criterion)) throw Error("no $ expressions in $all");
                // This is always a regexp or equality selector.
                branchedMatchers.push(compileValueSelector(criterion, matcher));
            });
            // andBranchedMatchers does NOT require all selectors to return true on the
            // SAME branch.
            return andBranchedMatchers(branchedMatchers);
        },
        $near: function(operand, valueSelector, matcher, isRoot) {
            if (!isRoot) throw Error("$near can't be inside another $ operator");
            matcher._hasGeoQuery = true;
            // There are two kinds of geodata in MongoDB: coordinate pairs and
            // GeoJSON. They use different distance metrics, too. GeoJSON queries are
            // marked with a $geometry property.
            var maxDistance, point, distance;
            if (isPlainObject(operand) && _.has(operand, "$geometry")) {
                // GeoJSON "2dsphere" mode.
                maxDistance = operand.$maxDistance;
                point = operand.$geometry;
                distance = function(value) {
                    // XXX: for now, we don't calculate the actual distance between, say,
                    // polygon and circle. If people care about this use-case it will get
                    // a priority.
                    if (!value || !value.type) return null;
                    if (value.type === "Point") {
                        return GeoJSON.pointDistance(point, value);
                    } else {
                        return GeoJSON.geometryWithinRadius(value, point, maxDistance) ? 0 : maxDistance + 1;
                    }
                };
            } else {
                maxDistance = valueSelector.$maxDistance;
                if (!isArray(operand) && !isPlainObject(operand)) throw Error("$near argument must be coordinate pair or GeoJSON");
                point = pointToArray(operand);
                distance = function(value) {
                    if (!isArray(value) && !isPlainObject(value)) return null;
                    return distanceCoordinatePairs(point, value);
                };
            }
            return function(branchedValues) {
                // There might be multiple points in the document that match the given
                // field. Only one of them needs to be within $maxDistance, but we need to
                // evaluate all of them and use the nearest one for the implicit sort
                // specifier. (That's why we can't just use ELEMENT_OPERATORS here.)
                //
                // Note: This differs from MongoDB's implementation, where a document will
                // actually show up *multiple times* in the result set, with one entry for
                // each within-$maxDistance branching point.
                branchedValues = expandArraysInBranches(branchedValues);
                var result = {
                    result: false
                };
                _.each(branchedValues, function(branch) {
                    var curDistance = distance(branch.value);
                    // Skip branches that aren't real points or are too far away.
                    if (curDistance === null || curDistance > maxDistance) return;
                    // Skip anything that's a tie.
                    if (result.distance !== undefined && result.distance <= curDistance) return;
                    result.result = true;
                    result.distance = curDistance;
                    if (!branch.arrayIndices) delete result.arrayIndices; else result.arrayIndices = branch.arrayIndices;
                });
                return result;
            };
        }
    };
    // Helpers for $near.
    var distanceCoordinatePairs = function(a, b) {
        a = pointToArray(a);
        b = pointToArray(b);
        var x = a[0] - b[0];
        var y = a[1] - b[1];
        if (_.isNaN(x) || _.isNaN(y)) return null;
        return Math.sqrt(x * x + y * y);
    };
    // Makes sure we get 2 elements array and assume the first one to be x and
    // the second one to y no matter what user passes.
    // In case user passes { lon: x, lat: y } returns [x, y]
    var pointToArray = function(point) {
        return _.map(point, _.identity);
    };
    // Helper for $lt/$gt/$lte/$gte.
    var makeInequality = function(cmpValueComparator) {
        return {
            compileElementSelector: function(operand) {
                // Arrays never compare false with non-arrays for any inequality.
                // XXX This was behavior we observed in pre-release MongoDB 2.5, but
                //     it seems to have been reverted.
                //     See https://jira.mongodb.org/browse/SERVER-11444
                if (isArray(operand)) {
                    return function() {
                        return false;
                    };
                }
                // Special case: consider undefined and null the same (so true with
                // $gte/$lte).
                if (operand === undefined) operand = null;
                var operandType = LocalCollection._f._type(operand);
                return function(value) {
                    if (value === undefined) value = null;
                    // Comparisons are never true among things of different type (except
                    // null vs undefined).
                    if (LocalCollection._f._type(value) !== operandType) return false;
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
        $lt: makeInequality(function(cmpValue) {
            return cmpValue < 0;
        }),
        $gt: makeInequality(function(cmpValue) {
            return cmpValue > 0;
        }),
        $lte: makeInequality(function(cmpValue) {
            return cmpValue <= 0;
        }),
        $gte: makeInequality(function(cmpValue) {
            return cmpValue >= 0;
        }),
        $mod: {
            compileElementSelector: function(operand) {
                if (!(isArray(operand) && operand.length === 2 && typeof operand[0] === "number" && typeof operand[1] === "number")) {
                    throw Error("argument to $mod must be an array of two numbers");
                }
                // XXX could require to be ints or round or something
                var divisor = operand[0];
                var remainder = operand[1];
                return function(value) {
                    return typeof value === "number" && value % divisor === remainder;
                };
            }
        },
        $in: {
            compileElementSelector: function(operand) {
                if (!isArray(operand)) throw Error("$in needs an array");
                var elementMatchers = [];
                _.each(operand, function(option) {
                    if (option instanceof RegExp) elementMatchers.push(regexpElementMatcher(option)); else if (isOperatorObject(option)) throw Error("cannot nest $ under $in"); else elementMatchers.push(equalityElementMatcher(option));
                });
                return function(value) {
                    // Allow {a: {$in: [null]}} to match when 'a' does not exist.
                    if (value === undefined) value = null;
                    return _.any(elementMatchers, function(e) {
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
            compileElementSelector: function(operand) {
                if (typeof operand === "string") {
                    // Don't ask me why, but by experimentation, this seems to be what Mongo
                    // does.
                    operand = 0;
                } else if (typeof operand !== "number") {
                    throw Error("$size needs a number");
                }
                return function(value) {
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
            compileElementSelector: function(operand) {
                if (typeof operand !== "number") throw Error("$type needs a number");
                return function(value) {
                    return value !== undefined && LocalCollection._f._type(value) === operand;
                };
            }
        },
        $regex: {
            compileElementSelector: function(operand, valueSelector) {
                if (!(typeof operand === "string" || operand instanceof RegExp)) throw Error("$regex has to be a string or RegExp");
                var regexp;
                if (valueSelector.$options !== undefined) {
                    // Options passed in $options (even the empty string) always overrides
                    // options in the RegExp object itself. (See also
                    // Mongo.Collection._rewriteSelector.)
                    // Be clear that we only support the JS-supported options, not extended
                    // ones (eg, Mongo supports x and s). Ideally we would implement x and s
                    // by transforming the regexp, but not today...
                    if (/[^gim]/.test(valueSelector.$options)) throw new Error("Only the i, m, and g regexp options are supported");
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
            compileElementSelector: function(operand, valueSelector, matcher) {
                if (!isPlainObject(operand)) throw Error("$elemMatch need an object");
                var subMatcher, isDocMatcher;
                if (isOperatorObject(operand, true)) {
                    subMatcher = compileValueSelector(operand, matcher);
                    isDocMatcher = false;
                } else {
                    // This is NOT the same as compileValueSelector(operand), and not just
                    // because of the slightly different calling convention.
                    // {$elemMatch: {x: 3}} means "an element has a field x:3", not
                    // "consists only of a field x:3". Also, regexps and sub-$ are allowed.
                    subMatcher = compileDocumentSelector(operand, matcher, {
                        inElemMatch: true
                    });
                    isDocMatcher = true;
                }
                return function(value) {
                    if (!isArray(value)) return false;
                    for (var i = 0; i < value.length; ++i) {
                        var arrayElement = value[i];
                        var arg;
                        if (isDocMatcher) {
                            // We can only match {$elemMatch: {b: 3}} against objects.
                            // (We can also match against arrays, if there's numeric indices,
                            // eg {$elemMatch: {'0.b': 3}} or {$elemMatch: {0: 3}}.)
                            if (!isPlainObject(arrayElement) && !isArray(arrayElement)) return false;
                            arg = arrayElement;
                        } else {
                            // dontIterate ensures that {a: {$elemMatch: {$gt: 5}}} matches
                            // {a: [8]} but not {a: [[8]]}
                            arg = [ {
                                value: arrayElement,
                                dontIterate: true
                            } ];
                        }
                        // XXX support $near in $elemMatch by propagating $distance?
                        if (subMatcher(arg).result) return i;
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
    makeLookupFunction = function(key, options) {
        options = options || {};
        var parts = key.split(".");
        var firstPart = parts.length ? parts[0] : "";
        var firstPartIsNumeric = isNumericKey(firstPart);
        var nextPartIsNumeric = parts.length >= 2 && isNumericKey(parts[1]);
        var lookupRest;
        if (parts.length > 1) {
            lookupRest = makeLookupFunction(parts.slice(1).join("."));
        }
        var omitUnnecessaryFields = function(retVal) {
            if (!retVal.dontIterate) delete retVal.dontIterate;
            if (retVal.arrayIndices && !retVal.arrayIndices.length) delete retVal.arrayIndices;
            return retVal;
        };
        // Doc will always be a plain object or an array.
        // apply an explicit numeric index, an array.
        return function(doc, arrayIndices) {
            if (!arrayIndices) arrayIndices = [];
            if (isArray(doc)) {
                // If we're being asked to do an invalid lookup into an array (non-integer
                // or out-of-bounds), return no results (which is different from returning
                // a single undefined result, in that `null` equality checks won't match).
                if (!(firstPartIsNumeric && firstPart < doc.length)) return [];
                // Remember that we used this array index. Include an 'x' to indicate that
                // the previous index came from being considered as an explicit array
                // index (not branching).
                arrayIndices = arrayIndices.concat(+firstPart, "x");
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
                return [ omitUnnecessaryFields({
                    value: firstLevel,
                    dontIterate: isArray(doc) && isArray(firstLevel),
                    arrayIndices: arrayIndices
                }) ];
            }
            // We need to dig deeper.  But if we can't, because what we've found is not
            // an array or plain object, we're done. If we just did a numeric index into
            // an array, we return nothing here (this is a change in Mongo 2.5 from
            // Mongo 2.4, where {'a.0.b': null} stopped matching {a: [5]}). Otherwise,
            // return a single `undefined` (which can, for example, match via equality
            // with `null`).
            if (!isIndexable(firstLevel)) {
                if (isArray(doc)) return [];
                return [ omitUnnecessaryFields({
                    value: undefined,
                    arrayIndices: arrayIndices
                }) ];
            }
            var result = [];
            var appendToResult = function(more) {
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
                _.each(firstLevel, function(branch, arrayIndex) {
                    if (isPlainObject(branch)) {
                        appendToResult(lookupRest(branch, arrayIndices.concat(arrayIndex)));
                    }
                });
            }
            return result;
        };
    };
    MinimongoTest.makeLookupFunction = makeLookupFunction;
    expandArraysInBranches = function(branches, skipTheArrays) {
        var branchesOut = [];
        _.each(branches, function(branch) {
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
                _.each(branch.value, function(leaf, i) {
                    branchesOut.push({
                        value: leaf,
                        arrayIndices: (branch.arrayIndices || []).concat(i)
                    });
                });
            }
        });
        return branchesOut;
    };
    var nothingMatcher = function(docOrBranchedValues) {
        return {
            result: false
        };
    };
    var everythingMatcher = function(docOrBranchedValues) {
        return {
            result: true
        };
    };
    // NB: We are cheating and using this function to implement "AND" for both
    // "document matchers" and "branched matchers". They both return result objects
    // but the argument is different: for the former it's a whole doc, whereas for
    // the latter it's an array of "branched values".
    var andSomeMatchers = function(subMatchers) {
        if (subMatchers.length === 0) return everythingMatcher;
        if (subMatchers.length === 1) return subMatchers[0];
        return function(docOrBranches) {
            var ret = {};
            ret.result = _.all(subMatchers, function(f) {
                var subResult = f(docOrBranches);
                // Copy a 'distance' number out of the first sub-matcher that has
                // one. Yes, this means that if there are multiple $near fields in a
                // query, something arbitrary happens; this appears to be consistent with
                // Mongo.
                if (subResult.result && subResult.distance !== undefined && ret.distance === undefined) {
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
        _type: function(v) {
            if (typeof v === "number") return 1;
            if (typeof v === "string") return 2;
            if (typeof v === "boolean") return 8;
            if (isArray(v)) return 4;
            if (v === null) return 10;
            if (v instanceof RegExp) // note that typeof(/x/) === "object"
            return 11;
            if (typeof v === "function") return 13;
            if (v instanceof Date) return 9;
            if (EJSON.isBinary(v)) return 5;
            if (v instanceof LocalCollection._ObjectID) return 7;
            return 3;
        },
        // deep equality test: use for literal document and array matches
        _equal: function(a, b) {
            return EJSON.equals(a, b, {
                keyOrderSensitive: true
            });
        },
        // maps a type code to a value that can be used to sort values of
        // different types
        _typeorder: function(t) {
            // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
            // XXX what is the correct sort position for Javascript code?
            // ('100' in the matrix below)
            // XXX minkey/maxkey
            return [ -1, // (not a type)
            1, // number
            2, // string
            3, // object
            4, // array
            5, // binary
            -1, // deprecated
            6, // ObjectID
            7, // bool
            8, // Date
            0, // null
            9, // RegExp
            -1, // deprecated
            100, // JS code
            2, // deprecated (symbol)
            100, // JS code
            1, // 32-bit int
            8, // Mongo timestamp
            1 ][t];
        },
        // compare two values of unknown type according to BSON ordering
        // semantics. (as an extension, consider 'undefined' to be less than
        // any other value.) return negative if a is less, positive if b is
        // less, or 0 if equal
        _cmp: function(a, b) {
            if (a === undefined) return b === undefined ? 0 : -1;
            if (b === undefined) return 1;
            var ta = LocalCollection._f._type(a);
            var tb = LocalCollection._f._type(b);
            var oa = LocalCollection._f._typeorder(ta);
            var ob = LocalCollection._f._typeorder(tb);
            if (oa !== ob) return oa < ob ? -1 : 1;
            if (ta !== tb) // XXX need to implement this if we implement Symbol or integers, or
            // Timestamp
            throw Error("Missing type coercion logic in _cmp");
            if (ta === 7) {
                // ObjectID
                // Convert to string.
                ta = tb = 2;
                a = a.toHexString();
                b = b.toHexString();
            }
            if (ta === 9) {
                // Date
                // Convert to millis.
                ta = tb = 1;
                a = a.getTime();
                b = b.getTime();
            }
            if (ta === 1) // double
            return a - b;
            if (tb === 2) // string
            return a < b ? -1 : a === b ? 0 : 1;
            if (ta === 3) {
                // Object
                // this could be much more efficient in the expected case ...
                var to_array = function(obj) {
                    var ret = [];
                    for (var key in obj) {
                        ret.push(key);
                        ret.push(obj[key]);
                    }
                    return ret;
                };
                return LocalCollection._f._cmp(to_array(a), to_array(b));
            }
            if (ta === 4) {
                // Array
                for (var i = 0; ;i++) {
                    if (i === a.length) return i === b.length ? 0 : -1;
                    if (i === b.length) return 1;
                    var s = LocalCollection._f._cmp(a[i], b[i]);
                    if (s !== 0) return s;
                }
            }
            if (ta === 5) {
                // binary
                // Surprisingly, a small binary blob is always less than a large one in
                // Mongo.
                if (a.length !== b.length) return a.length - b.length;
                for (i = 0; i < a.length; i++) {
                    if (a[i] < b[i]) return -1;
                    if (a[i] > b[i]) return 1;
                }
                return 0;
            }
            if (ta === 8) {
                // boolean
                if (a) return b ? 0 : 1;
                return b ? -1 : 0;
            }
            if (ta === 10) // null
            return 0;
            if (ta === 11) // regexp
            throw Error("Sorting not supported on regular expression");
            // XXX
            // 13: javascript code
            // 14: symbol
            // 15: javascript code with scope
            // 16: 32-bit integer
            // 17: timestamp
            // 18: 64-bit integer
            // 255: minkey
            // 127: maxkey
            if (ta === 13) // javascript code
            throw Error("Sorting not supported on Javascript code");
            // XXX
            throw Error("Unknown type to sort");
        }
    };
    // Oddball function used by upsert.
    LocalCollection._removeDollarOperators = function(selector) {
        var selectorDoc = {};
        for (var k in selector) if (k.substr(0, 1) !== "$") selectorDoc[k] = selector[k];
        return selectorDoc;
    };
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
    Minimongo.Sorter = function(spec, options) {
        var self = this;
        options = options || {};
        self._sortSpecParts = [];
        var addSpecPart = function(path, ascending) {
            if (!path) throw Error("sort keys must be non-empty");
            if (path.charAt(0) === "$") throw Error("unsupported sort key: " + path);
            self._sortSpecParts.push({
                path: path,
                lookup: makeLookupFunction(path, {
                    forSort: true
                }),
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
            _.each(spec, function(value, key) {
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
            _.each(self._sortSpecParts, function(spec) {
                selector[spec.path] = 1;
            });
            self._selectorForAffectedByModifier = new Minimongo.Matcher(selector);
        }
        self._keyComparator = composeComparators(_.map(self._sortSpecParts, function(spec, i) {
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
        getComparator: function(options) {
            var self = this;
            // If we have no distances, just use the comparator from the source
            // specification (which defaults to "everything is equal".
            if (!options || !options.distances) {
                return self._getBaseComparator();
            }
            var distances = options.distances;
            // Return a comparator which first tries the sort specification, and if that
            // says "it's equal", breaks ties using $near distances.
            return composeComparators([ self._getBaseComparator(), function(a, b) {
                if (!distances.has(a._id)) throw Error("Missing distance for " + a._id);
                if (!distances.has(b._id)) throw Error("Missing distance for " + b._id);
                return distances.get(a._id) - distances.get(b._id);
            } ]);
        },
        _getPaths: function() {
            var self = this;
            return _.pluck(self._sortSpecParts, "path");
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
        _getMinKeyFromDoc: function(doc) {
            var self = this;
            var minKey = null;
            self._generateKeysFromDoc(doc, function(key) {
                if (!self._keyCompatibleWithSelector(key)) return;
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
            if (minKey === null) throw Error("sort selector found no keys in doc?");
            return minKey;
        },
        _keyCompatibleWithSelector: function(key) {
            var self = this;
            return !self._keyFilter || self._keyFilter(key);
        },
        // Iterates over each possible "key" from doc (ie, over each branch), calling
        // 'cb' with the key.
        _generateKeysFromDoc: function(doc, cb) {
            var self = this;
            if (self._sortSpecParts.length === 0) throw new Error("can't generate keys without a spec");
            // maps index -> ({'' -> value} or {path -> value})
            var valuesByIndexAndPath = [];
            var pathFromIndices = function(indices) {
                return indices.join(",") + ",";
            };
            var knownPaths = null;
            _.each(self._sortSpecParts, function(spec, whichField) {
                // Expand any leaf arrays that we find, and ignore those arrays
                // themselves.  (We never sort based on an array itself.)
                var branches = expandArraysInBranches(spec.lookup(doc), true);
                // If there are no values for a key (eg, key goes to an empty array),
                // pretend we found one null value.
                if (!branches.length) branches = [ {
                    value: null
                } ];
                var usedPaths = false;
                valuesByIndexAndPath[whichField] = {};
                _.each(branches, function(branch) {
                    if (!branch.arrayIndices) {
                        // If there are no array indices for a branch, then it must be the
                        // only branch, because the only thing that produces multiple branches
                        // is the use of arrays.
                        if (branches.length > 1) throw Error("multiple branches but no array used?");
                        valuesByIndexAndPath[whichField][""] = branch.value;
                        return;
                    }
                    usedPaths = true;
                    var path = pathFromIndices(branch.arrayIndices);
                    if (_.has(valuesByIndexAndPath[whichField], path)) throw Error("duplicate path: " + path);
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
                    if (!_.has(valuesByIndexAndPath[whichField], "") && _.size(knownPaths) !== _.size(valuesByIndexAndPath[whichField])) {
                        throw Error("cannot index parallel arrays!");
                    }
                } else if (usedPaths) {
                    knownPaths = {};
                    _.each(valuesByIndexAndPath[whichField], function(x, path) {
                        knownPaths[path] = true;
                    });
                }
            });
            if (!knownPaths) {
                // Easy case: no use of arrays.
                var soleKey = _.map(valuesByIndexAndPath, function(values) {
                    if (!_.has(values, "")) throw Error("no value in sole key case?");
                    return values[""];
                });
                cb(soleKey);
                return;
            }
            _.each(knownPaths, function(x, path) {
                var key = _.map(valuesByIndexAndPath, function(values) {
                    if (_.has(values, "")) return values[""];
                    if (!_.has(values, path)) throw Error("missing path?");
                    return values[path];
                });
                cb(key);
            });
        },
        // Takes in two keys: arrays whose lengths match the number of spec
        // parts. Returns negative, 0, or positive based on using the sort spec to
        // compare fields.
        _compareKeys: function(key1, key2) {
            var self = this;
            if (key1.length !== self._sortSpecParts.length || key2.length !== self._sortSpecParts.length) {
                throw Error("Key has wrong length");
            }
            return self._keyComparator(key1, key2);
        },
        // Given an index 'i', returns a comparator that compares two key arrays based
        // on field 'i'.
        _keyFieldComparator: function(i) {
            var self = this;
            var invert = !self._sortSpecParts[i].ascending;
            return function(key1, key2) {
                var compare = LocalCollection._f._cmp(key1[i], key2[i]);
                if (invert) compare = -compare;
                return compare;
            };
        },
        // Returns a comparator that represents the sort specification (but not
        // including a possible geoquery distance tie-breaker).
        _getBaseComparator: function() {
            var self = this;
            // If we're only sorting on geoquery distance and no specs, just say
            // everything is equal.
            if (!self._sortSpecParts.length) {
                return function(doc1, doc2) {
                    return 0;
                };
            }
            return function(doc1, doc2) {
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
        _useWithMatcher: function(matcher) {
            var self = this;
            if (self._keyFilter) throw Error("called _useWithMatcher twice?");
            // If we are only sorting by distance, then we're not going to bother to
            // build a key filter.
            // XXX figure out how geoqueries interact with this stuff
            if (_.isEmpty(self._sortSpecParts)) return;
            var selector = matcher._selector;
            // If the user just passed a literal function to find(), then we can't get a
            // key filter from it.
            if (selector instanceof Function) return;
            var constraintsByPath = {};
            _.each(self._sortSpecParts, function(spec, i) {
                constraintsByPath[spec.path] = [];
            });
            _.each(selector, function(subSelector, key) {
                // XXX support $and and $or
                var constraints = constraintsByPath[key];
                if (!constraints) return;
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
                    if (subSelector.ignoreCase || subSelector.multiline) return;
                    constraints.push(regexpElementMatcher(subSelector));
                    return;
                }
                if (isOperatorObject(subSelector)) {
                    _.each(subSelector, function(operand, operator) {
                        if (_.contains([ "$lt", "$lte", "$gt", "$gte" ], operator)) {
                            // XXX this depends on us knowing that these operators don't use any
                            // of the arguments to compileElementSelector other than operand.
                            constraints.push(ELEMENT_OPERATORS[operator].compileElementSelector(operand));
                        }
                        // See comments in the RegExp block above.
                        if (operator === "$regex" && !subSelector.$options) {
                            constraints.push(ELEMENT_OPERATORS.$regex.compileElementSelector(operand, subSelector));
                        }
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
            if (_.isEmpty(constraintsByPath[self._sortSpecParts[0].path])) return;
            self._keyFilter = function(key) {
                return _.all(self._sortSpecParts, function(specPart, index) {
                    return _.all(constraintsByPath[specPart.path], function(f) {
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
    var composeComparators = function(comparatorArray) {
        return function(a, b) {
            for (var i = 0; i < comparatorArray.length; ++i) {
                var compare = comparatorArray[i](a, b);
                if (compare !== 0) return compare;
            }
            return 0;
        };
    };
    // Knows how to compile a fields projection to a predicate function.
    // @returns - Function: a closure that filters out an object according to the
    //            fields projection rules:
    //            @param obj - Object: MongoDB-styled document
    //            @returns - Object: a document with the fields filtered out
    //                       according to projection rules. Doesn't retain subfields
    //                       of passed argument.
    LocalCollection._compileProjection = function(fields) {
        LocalCollection._checkSupportedProjection(fields);
        var _idProjection = _.isUndefined(fields._id) ? true : fields._id;
        var details = projectionDetails(fields);
        // returns transformed doc according to ruleTree
        var transform = function(doc, ruleTree) {
            // Special case for "sets"
            if (_.isArray(doc)) return _.map(doc, function(subdoc) {
                return transform(subdoc, ruleTree);
            });
            var res = details.including ? {} : EJSON.clone(doc);
            _.each(ruleTree, function(rule, key) {
                if (!_.has(doc, key)) return;
                if (_.isObject(rule)) {
                    // For sub-objects/subsets we branch
                    if (_.isObject(doc[key])) res[key] = transform(doc[key], rule);
                } else if (details.including) res[key] = EJSON.clone(doc[key]); else delete res[key];
            });
            return res;
        };
        return function(obj) {
            var res = transform(obj, details.tree);
            if (_idProjection && _.has(obj, "_id")) res._id = obj._id;
            if (!_idProjection && _.has(res, "_id")) delete res._id;
            return res;
        };
    };
    // Traverses the keys of passed projection and constructs a tree where all
    // leaves are either all True or all False
    // @returns Object:
    //  - tree - Object - tree representation of keys involved in projection
    //  (exception for '_id' as it is a special case handled separately)
    //  - including - Boolean - "take only certain fields" type of projection
    projectionDetails = function(fields) {
        // Find the non-_id keys (_id is handled specially because it is included unless
        // explicitly excluded). Sort the keys, so that our code to detect overlaps
        // like 'foo' and 'foo.bar' can assume that 'foo' comes first.
        var fieldsKeys = _.keys(fields).sort();
        // If there are other rules other than '_id', treat '_id' differently in a
        // separate case. If '_id' is the only rule, use it to understand if it is
        // including/excluding projection.
        if (fieldsKeys.length > 0 && !(fieldsKeys.length === 1 && fieldsKeys[0] === "_id")) fieldsKeys = _.reject(fieldsKeys, function(key) {
            return key === "_id";
        });
        var including = null;
        // Unknown
        _.each(fieldsKeys, function(keyPath) {
            var rule = !!fields[keyPath];
            if (including === null) including = rule;
            if (including !== rule) // This error message is copies from MongoDB shell
            throw MinimongoError("You cannot currently mix including and excluding fields.");
        });
        var projectionRulesTree = pathsToTree(fieldsKeys, function(path) {
            return including;
        }, function(node, path, fullPath) {
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
            throw MinimongoError("both " + currentPath + " and " + anotherPath + " found in fields option, using both of them may trigger " + "unexpected behavior. Did you mean to use only one of them?");
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
    pathsToTree = function(paths, newLeafFn, conflictFn, tree) {
        tree = tree || {};
        _.each(paths, function(keyPath) {
            var treePos = tree;
            var pathArr = keyPath.split(".");
            // use _.all just for iteration with break
            var success = _.all(pathArr.slice(0, -1), function(key, idx) {
                if (!_.has(treePos, key)) treePos[key] = {}; else if (!_.isObject(treePos[key])) {
                    treePos[key] = conflictFn(treePos[key], pathArr.slice(0, idx + 1).join("."), keyPath);
                    // break out of loop if we are failing for this path
                    if (!_.isObject(treePos[key])) return false;
                }
                treePos = treePos[key];
                return true;
            });
            if (success) {
                var lastKey = _.last(pathArr);
                if (!_.has(treePos, lastKey)) treePos[lastKey] = newLeafFn(keyPath); else treePos[lastKey] = conflictFn(treePos[lastKey], keyPath, keyPath);
            }
        });
        return tree;
    };
    LocalCollection._checkSupportedProjection = function(fields) {
        if (!_.isObject(fields) || _.isArray(fields)) throw MinimongoError("fields option must be an object");
        _.each(fields, function(val, keyPath) {
            if (_.contains(keyPath.split("."), "$")) throw MinimongoError("Minimongo doesn't support $ operator in projections yet.");
            if (_.indexOf([ 1, 0, true, false ], val) === -1) throw MinimongoError("Projection values should be one of 1, 0, true, or false");
        });
    };
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
    LocalCollection._modify = function(doc, mod, options) {
        options = options || {};
        if (!isPlainObject(mod)) throw MinimongoError("Modifier must be an object");
        var isModifier = isOperatorObject(mod);
        var newDoc;
        if (!isModifier) {
            if (mod._id && !EJSON.equals(doc._id, mod._id)) throw MinimongoError("Cannot change the _id of a document");
            // replace the whole document
            for (var k in mod) {
                if (/\./.test(k)) throw MinimongoError("When replacing document, field name may not contain '.'");
            }
            newDoc = mod;
        } else {
            // apply modifiers to the doc.
            newDoc = EJSON.clone(doc);
            _.each(mod, function(operand, op) {
                var modFunc = MODIFIERS[op];
                // Treat $setOnInsert as $set if this is an insert.
                if (options.isInsert && op === "$setOnInsert") modFunc = MODIFIERS["$set"];
                if (!modFunc) throw MinimongoError("Invalid modifier specified " + op);
                _.each(operand, function(arg, keypath) {
                    if (keypath === "") {
                        throw MinimongoError("An empty update path is not valid.");
                    }
                    if (keypath === "_id") {
                        throw MinimongoError("Mod on _id not allowed");
                    }
                    var keyparts = keypath.split(".");
                    if (!_.all(keyparts, _.identity)) {
                        throw MinimongoError("The update path '" + keypath + "' contains an empty field name, which is not allowed.");
                    }
                    var noCreate = _.has(NO_CREATE_MODIFIERS, op);
                    var forbidArray = op === "$rename";
                    var target = findModTarget(newDoc, keyparts, {
                        noCreate: NO_CREATE_MODIFIERS[op],
                        forbidArray: op === "$rename",
                        arrayIndices: options.arrayIndices
                    });
                    var field = keyparts.pop();
                    modFunc(target, field, arg, keypath, newDoc);
                });
            });
        }
        // move new document into place.
        _.each(_.keys(doc), function(k) {
            // Note: this used to be for (var k in doc) however, this does not
            // work right in Opera. Deleting from a doc while iterating over it
            // would sometimes cause opera to skip some keys.
            if (k !== "_id") delete doc[k];
        });
        _.each(newDoc, function(v, k) {
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
    var findModTarget = function(doc, keyparts, options) {
        options = options || {};
        var usedArrayIndex = false;
        for (var i = 0; i < keyparts.length; i++) {
            var last = i === keyparts.length - 1;
            var keypart = keyparts[i];
            var indexable = isIndexable(doc);
            if (!indexable) {
                if (options.noCreate) return undefined;
                var e = MinimongoError("cannot use the part '" + keypart + "' to traverse " + doc);
                e.setPropertyError = true;
                throw e;
            }
            if (doc instanceof Array) {
                if (options.forbidArray) return null;
                if (keypart === "$") {
                    if (usedArrayIndex) throw MinimongoError("Too many positional (i.e. '$') elements");
                    if (!options.arrayIndices || !options.arrayIndices.length) {
                        throw MinimongoError("The positional operator did not find the " + "match needed from the query");
                    }
                    keypart = options.arrayIndices[0];
                    usedArrayIndex = true;
                } else if (isNumericKey(keypart)) {
                    keypart = parseInt(keypart);
                } else {
                    if (options.noCreate) return undefined;
                    throw MinimongoError("can't append to array using string field name [" + keypart + "]");
                }
                if (last) // handle 'a.01'
                keyparts[i] = keypart;
                if (options.noCreate && keypart >= doc.length) return undefined;
                while (doc.length < keypart) doc.push(null);
                if (!last) {
                    if (doc.length === keypart) doc.push({}); else if (typeof doc[keypart] !== "object") throw MinimongoError("can't modify field '" + keyparts[i + 1] + "' of list value " + JSON.stringify(doc[keypart]));
                }
            } else {
                if (keypart.length && keypart.substr(0, 1) === "$") throw MinimongoError("can't set field named " + keypart);
                if (!(keypart in doc)) {
                    if (options.noCreate) return undefined;
                    if (!last) doc[keypart] = {};
                }
            }
            if (last) return doc;
            doc = doc[keypart];
        }
    };
    var NO_CREATE_MODIFIERS = {
        $unset: true,
        $pop: true,
        $rename: true,
        $pull: true,
        $pullAll: true
    };
    var MODIFIERS = {
        $inc: function(target, field, arg) {
            if (typeof arg !== "number") throw MinimongoError("Modifier $inc allowed for numbers only");
            if (field in target) {
                if (typeof target[field] !== "number") throw MinimongoError("Cannot apply $inc modifier to non-number");
                target[field] += arg;
            } else {
                target[field] = arg;
            }
        },
        $set: function(target, field, arg) {
            if (!_.isObject(target)) {
                // not an array or an object
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
        $setOnInsert: function(target, field, arg) {},
        $unset: function(target, field, arg) {
            if (target !== undefined) {
                if (target instanceof Array) {
                    if (field in target) target[field] = null;
                } else delete target[field];
            }
        },
        $push: function(target, field, arg) {
            if (target[field] === undefined) target[field] = [];
            if (!(target[field] instanceof Array)) throw MinimongoError("Cannot apply $push modifier to non-array");
            if (!(arg && arg.$each)) {
                // Simple mode: not $each
                target[field].push(EJSON.clone(arg));
                return;
            }
            // Fancy mode: $each (and maybe $slice and $sort)
            var toPush = arg.$each;
            if (!(toPush instanceof Array)) throw MinimongoError("$each must be an array");
            // Parse $slice.
            var slice = undefined;
            if ("$slice" in arg) {
                if (typeof arg.$slice !== "number") throw MinimongoError("$slice must be a numeric value");
                // XXX should check to make sure integer
                if (arg.$slice > 0) throw MinimongoError("$slice in $push must be zero or negative");
                slice = arg.$slice;
            }
            // Parse $sort.
            var sortFunction = undefined;
            if (arg.$sort) {
                if (slice === undefined) throw MinimongoError("$sort requires $slice to be present");
                // XXX this allows us to use a $sort whose value is an array, but that's
                // actually an extension of the Node driver, so it won't work
                // server-side. Could be confusing!
                // XXX is it correct that we don't do geo-stuff here?
                sortFunction = new Minimongo.Sorter(arg.$sort).getComparator();
                for (var i = 0; i < toPush.length; i++) {
                    if (LocalCollection._f._type(toPush[i]) !== 3) {
                        throw MinimongoError("$push like modifiers using $sort " + "require all elements to be objects");
                    }
                }
            }
            // Actually push.
            for (var j = 0; j < toPush.length; j++) target[field].push(EJSON.clone(toPush[j]));
            // Actually sort.
            if (sortFunction) target[field].sort(sortFunction);
            // Actually slice.
            if (slice !== undefined) {
                if (slice === 0) target[field] = []; else target[field] = target[field].slice(slice);
            }
        },
        $pushAll: function(target, field, arg) {
            if (!(typeof arg === "object" && arg instanceof Array)) throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");
            var x = target[field];
            if (x === undefined) target[field] = arg; else if (!(x instanceof Array)) throw MinimongoError("Cannot apply $pushAll modifier to non-array"); else {
                for (var i = 0; i < arg.length; i++) x.push(arg[i]);
            }
        },
        $addToSet: function(target, field, arg) {
            var isEach = false;
            if (typeof arg === "object") {
                //check if first key is '$each'
                for (var k in arg) {
                    if (k === "$each") isEach = true;
                    break;
                }
            }
            var values = isEach ? arg["$each"] : [ arg ];
            var x = target[field];
            if (x === undefined) target[field] = values; else if (!(x instanceof Array)) throw MinimongoError("Cannot apply $addToSet modifier to non-array"); else {
                _.each(values, function(value) {
                    for (var i = 0; i < x.length; i++) if (LocalCollection._f._equal(value, x[i])) return;
                    x.push(EJSON.clone(value));
                });
            }
        },
        $pop: function(target, field, arg) {
            if (target === undefined) return;
            var x = target[field];
            if (x === undefined) return; else if (!(x instanceof Array)) throw MinimongoError("Cannot apply $pop modifier to non-array"); else {
                if (typeof arg === "number" && arg < 0) x.splice(0, 1); else x.pop();
            }
        },
        $pull: function(target, field, arg) {
            if (target === undefined) return;
            var x = target[field];
            if (x === undefined) return; else if (!(x instanceof Array)) throw MinimongoError("Cannot apply $pull/pullAll modifier to non-array"); else {
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
                    for (var i = 0; i < x.length; i++) if (!matcher.documentMatches(x[i]).result) out.push(x[i]);
                } else {
                    for (var i = 0; i < x.length; i++) if (!LocalCollection._f._equal(x[i], arg)) out.push(x[i]);
                }
                target[field] = out;
            }
        },
        $pullAll: function(target, field, arg) {
            if (!(typeof arg === "object" && arg instanceof Array)) throw MinimongoError("Modifier $pushAll/pullAll allowed for arrays only");
            if (target === undefined) return;
            var x = target[field];
            if (x === undefined) return; else if (!(x instanceof Array)) throw MinimongoError("Cannot apply $pull/pullAll modifier to non-array"); else {
                var out = [];
                for (var i = 0; i < x.length; i++) {
                    var exclude = false;
                    for (var j = 0; j < arg.length; j++) {
                        if (LocalCollection._f._equal(x[i], arg[j])) {
                            exclude = true;
                            break;
                        }
                    }
                    if (!exclude) out.push(x[i]);
                }
                target[field] = out;
            }
        },
        $rename: function(target, field, arg, keypath, doc) {
            if (keypath === arg) // no idea why mongo has this restriction..
            throw MinimongoError("$rename source must differ from target");
            if (target === null) throw MinimongoError("$rename source field invalid");
            if (typeof arg !== "string") throw MinimongoError("$rename target must be a string");
            if (target === undefined) return;
            var v = target[field];
            delete target[field];
            var keyparts = arg.split(".");
            var target2 = findModTarget(doc, keyparts, {
                forbidArray: true
            });
            if (target2 === null) throw MinimongoError("$rename target field invalid");
            var field2 = keyparts.pop();
            target2[field2] = v;
        },
        $bit: function(target, field, arg) {
            // XXX mongo only supports $bit on integers, and we only support
            // native javascript numbers (doubles) so far, so we can't support $bit
            throw MinimongoError("$bit is not supported");
        }
    };
    // ordered: bool.
    // old_results and new_results: collections of documents.
    //    if ordered, they are arrays.
    //    if unordered, they are IdMaps
    LocalCollection._diffQueryChanges = function(ordered, oldResults, newResults, observer, options) {
        if (ordered) LocalCollection._diffQueryOrderedChanges(oldResults, newResults, observer, options); else LocalCollection._diffQueryUnorderedChanges(oldResults, newResults, observer, options);
    };
    LocalCollection._diffQueryUnorderedChanges = function(oldResults, newResults, observer, options) {
        options = options || {};
        var projectionFn = options.projectionFn || EJSON.clone;
        if (observer.movedBefore) {
            throw new Error("_diffQueryUnordered called with a movedBefore observer!");
        }
        newResults.forEach(function(newDoc, id) {
            var oldDoc = oldResults.get(id);
            if (oldDoc) {
                if (observer.changed && !EJSON.equals(oldDoc, newDoc)) {
                    var projectedNew = projectionFn(newDoc);
                    var projectedOld = projectionFn(oldDoc);
                    var changedFields = LocalCollection._makeChangedFields(projectedNew, projectedOld);
                    if (!_.isEmpty(changedFields)) {
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
            oldResults.forEach(function(oldDoc, id) {
                if (!newResults.has(id)) observer.removed(id);
            });
        }
    };
    LocalCollection._diffQueryOrderedChanges = function(old_results, new_results, observer, options) {
        options = options || {};
        var projectionFn = options.projectionFn || EJSON.clone;
        var new_presence_of_id = {};
        _.each(new_results, function(doc) {
            if (new_presence_of_id[doc._id]) Meteor._debug("Duplicate _id in new_results");
            new_presence_of_id[doc._id] = true;
        });
        var old_index_of_id = {};
        _.each(old_results, function(doc, i) {
            if (doc._id in old_index_of_id) Meteor._debug("Duplicate _id in old_results");
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
        for (var i = 0; i < N; i++) {
            if (old_index_of_id[new_results[i]._id] !== undefined) {
                var j = max_seq_len;
                // this inner loop would traditionally be a binary search,
                // but scanning backwards we will likely find a subseq to extend
                // pretty soon, bounded for example by the total number of ops.
                // If this were to be changed to a binary search, we'd still want
                // to scan backwards a bit as an optimization.
                while (j > 0) {
                    if (old_idx_seq(seq_ends[j - 1]) < old_idx_seq(i)) break;
                    j--;
                }
                ptrs[i] = j === 0 ? -1 : seq_ends[j - 1];
                seq_ends[j] = i;
                if (j + 1 > max_seq_len) max_seq_len = j + 1;
            }
        }
        // pull out the LCS/LIS into unmoved
        var idx = max_seq_len === 0 ? -1 : seq_ends[max_seq_len - 1];
        while (idx >= 0) {
            unmoved.push(idx);
            idx = ptrs[idx];
        }
        // the unmoved item list is built backwards, so fix that
        unmoved.reverse();
        // the last group is always anchored by the end of the result list, which is
        // an id of "null"
        unmoved.push(new_results.length);
        _.each(old_results, function(doc) {
            if (!new_presence_of_id[doc._id]) observer.removed && observer.removed(doc._id);
        });
        // for each group of things in the new_results that is anchored by an unmoved
        // element, iterate through the things before it.
        var startOfGroup = 0;
        _.each(unmoved, function(endOfGroup) {
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
            startOfGroup = endOfGroup + 1;
        });
    };
    // General helper for diff-ing two objects.
    // callbacks is an object like so:
    // { leftOnly: function (key, leftValue) {...},
    //   rightOnly: function (key, rightValue) {...},
    //   both: function (key, leftValue, rightValue) {...},
    // }
    LocalCollection._diffObjects = function(left, right, callbacks) {
        _.each(left, function(leftValue, key) {
            if (_.has(right, key)) callbacks.both && callbacks.both(key, leftValue, right[key]); else callbacks.leftOnly && callbacks.leftOnly(key, leftValue);
        });
        if (callbacks.rightOnly) {
            _.each(right, function(rightValue, key) {
                if (!_.has(left, key)) callbacks.rightOnly(key, rightValue);
            });
        }
    };
    LocalCollection._IdMap = function() {
        var self = this;
        IdMap.call(self, LocalCollection._idStringify, LocalCollection._idParse);
    };
    Meteor._inherits(LocalCollection._IdMap, IdMap);
    // XXX maybe move these into another ObserveHelpers package or something
    // _CachingChangeObserver is an object which receives observeChanges callbacks
    // and keeps a cache of the current cursor state up to date in self.docs. Users
    // of this class should read the docs field but not modify it. You should pass
    // the "applyChange" field as the callbacks to the underlying observeChanges
    // call. Optionally, you can specify your own observeChanges callbacks which are
    // invoked immediately before the docs field is updated; this object is made
    // available as `this` to those callbacks.
    LocalCollection._CachingChangeObserver = function(options) {
        var self = this;
        options = options || {};
        var orderedFromCallbacks = options.callbacks && LocalCollection._observeChangesCallbacksAreOrdered(options.callbacks);
        if (_.has(options, "ordered")) {
            self.ordered = options.ordered;
            if (options.callbacks && options.ordered !== orderedFromCallbacks) throw Error("ordered option doesn't match callbacks");
        } else if (options.callbacks) {
            self.ordered = orderedFromCallbacks;
        } else {
            throw Error("must provide ordered or callbacks");
        }
        var callbacks = options.callbacks || {};
        if (self.ordered) {
            self.docs = new OrderedDict(LocalCollection._idStringify);
            self.applyChange = {
                addedBefore: function(id, fields, before) {
                    var doc = EJSON.clone(fields);
                    doc._id = id;
                    callbacks.addedBefore && callbacks.addedBefore.call(self, id, fields, before);
                    // This line triggers if we provide added with movedBefore.
                    callbacks.added && callbacks.added.call(self, id, fields);
                    // XXX could `before` be a falsy ID?  Technically
                    // idStringify seems to allow for them -- though
                    // OrderedDict won't call stringify on a falsy arg.
                    self.docs.putBefore(id, doc, before || null);
                },
                movedBefore: function(id, before) {
                    var doc = self.docs.get(id);
                    callbacks.movedBefore && callbacks.movedBefore.call(self, id, before);
                    self.docs.moveBefore(id, before || null);
                }
            };
        } else {
            self.docs = new LocalCollection._IdMap();
            self.applyChange = {
                added: function(id, fields) {
                    var doc = EJSON.clone(fields);
                    callbacks.added && callbacks.added.call(self, id, fields);
                    doc._id = id;
                    self.docs.set(id, doc);
                }
            };
        }
        // The methods in _IdMap and OrderedDict used by these callbacks are
        // identical.
        self.applyChange.changed = function(id, fields) {
            var doc = self.docs.get(id);
            if (!doc) throw new Error("Unknown id for changed: " + id);
            callbacks.changed && callbacks.changed.call(self, id, EJSON.clone(fields));
            LocalCollection._applyChanges(doc, fields);
        };
        self.applyChange.removed = function(id) {
            callbacks.removed && callbacks.removed.call(self, id);
            self.docs.remove(id);
        };
    };
    LocalCollection._observeFromObserveChanges = function(cursor, observeCallbacks) {
        var transform = cursor.getTransform() || function(doc) {
            return doc;
        };
        var suppressed = !!observeCallbacks._suppress_initial;
        var observeChangesCallbacks;
        if (LocalCollection._observeCallbacksAreOrdered(observeCallbacks)) {
            // The "_no_indices" option sets all index arguments to -1 and skips the
            // linear scans required to generate them.  This lets observers that don't
            // need absolute indices benefit from the other features of this API --
            // relative order, transforms, and applyChanges -- without the speed hit.
            var indices = !observeCallbacks._no_indices;
            observeChangesCallbacks = {
                addedBefore: function(id, fields, before) {
                    var self = this;
                    if (suppressed || !(observeCallbacks.addedAt || observeCallbacks.added)) return;
                    var doc = transform(_.extend(fields, {
                        _id: id
                    }));
                    if (observeCallbacks.addedAt) {
                        var index = indices ? before ? self.docs.indexOf(before) : self.docs.size() : -1;
                        observeCallbacks.addedAt(doc, index, before);
                    } else {
                        observeCallbacks.added(doc);
                    }
                },
                changed: function(id, fields) {
                    var self = this;
                    if (!(observeCallbacks.changedAt || observeCallbacks.changed)) return;
                    var doc = EJSON.clone(self.docs.get(id));
                    if (!doc) throw new Error("Unknown id for changed: " + id);
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
                movedBefore: function(id, before) {
                    var self = this;
                    if (!observeCallbacks.movedTo) return;
                    var from = indices ? self.docs.indexOf(id) : -1;
                    var to = indices ? before ? self.docs.indexOf(before) : self.docs.size() : -1;
                    // When not moving backwards, adjust for the fact that removing the
                    // document slides everything back one slot.
                    if (to > from) --to;
                    observeCallbacks.movedTo(transform(EJSON.clone(self.docs.get(id))), from, to, before || null);
                },
                removed: function(id) {
                    var self = this;
                    if (!(observeCallbacks.removedAt || observeCallbacks.removed)) return;
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
                added: function(id, fields) {
                    if (!suppressed && observeCallbacks.added) {
                        var doc = _.extend(fields, {
                            _id: id
                        });
                        observeCallbacks.added(transform(doc));
                    }
                },
                changed: function(id, fields) {
                    var self = this;
                    if (observeCallbacks.changed) {
                        var oldDoc = self.docs.get(id);
                        var doc = EJSON.clone(oldDoc);
                        LocalCollection._applyChanges(doc, fields);
                        observeCallbacks.changed(transform(doc), transform(EJSON.clone(oldDoc)));
                    }
                },
                removed: function(id) {
                    var self = this;
                    if (observeCallbacks.removed) {
                        observeCallbacks.removed(transform(self.docs.get(id)));
                    }
                }
            };
        }
        var changeObserver = new LocalCollection._CachingChangeObserver({
            callbacks: observeChangesCallbacks
        });
        var handle = cursor.observeChanges(changeObserver.applyChange);
        suppressed = false;
        return handle;
    };
    LocalCollection._looksLikeObjectID = function(str) {
        return str.length === 24 && str.match(/^[0-9a-f]*$/);
    };
    LocalCollection._ObjectID = function(hexString) {
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
    LocalCollection._ObjectID.prototype.toString = function() {
        var self = this;
        return 'ObjectID("' + self._str + '")';
    };
    LocalCollection._ObjectID.prototype.equals = function(other) {
        var self = this;
        return other instanceof LocalCollection._ObjectID && self.valueOf() === other.valueOf();
    };
    LocalCollection._ObjectID.prototype.clone = function() {
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
    LocalCollection._ObjectID.prototype.valueOf = LocalCollection._ObjectID.prototype.toJSONValue = LocalCollection._ObjectID.prototype.toHexString = function() {
        return this._str;
    };
    // Is this selector just shorthand for lookup by _id?
    LocalCollection._selectorIsId = function(selector) {
        return typeof selector === "string" || typeof selector === "number" || selector instanceof LocalCollection._ObjectID;
    };
    // Is the selector just lookup by _id (shorthand or not)?
    LocalCollection._selectorIsIdPerhapsAsObject = function(selector) {
        return LocalCollection._selectorIsId(selector) || selector && typeof selector === "object" && selector._id && LocalCollection._selectorIsId(selector._id) && _.size(selector) === 1;
    };
    // If this is a selector which explicitly constrains the match by ID to a finite
    // number of documents, returns a list of their IDs.  Otherwise returns
    // null. Note that the selector may have other restrictions so it may not even
    // match those document!  We care about $in and $and since those are generated
    // access-controlled update and remove.
    LocalCollection._idsMatchedBySelector = function(selector) {
        // Is the selector just an ID?
        if (LocalCollection._selectorIsId(selector)) return [ selector ];
        if (!selector) return null;
        // Do we have an _id clause?
        if (_.has(selector, "_id")) {
            // Is the _id clause just an ID?
            if (LocalCollection._selectorIsId(selector._id)) return [ selector._id ];
            // Is the _id clause {_id: {$in: ["x", "y", "z"]}}?
            if (selector._id && selector._id.$in && _.isArray(selector._id.$in) && !_.isEmpty(selector._id.$in) && _.all(selector._id.$in, LocalCollection._selectorIsId)) {
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
                if (subIds) return subIds;
            }
        }
        return null;
    };
    EJSON.addType("oid", function(str) {
        return new LocalCollection._ObjectID(str);
    });
    // Simple implementation of dynamic scoping, for use in browsers
    var nextSlot = 0;
    var currentValues = [];
    Meteor.EnvironmentVariable = function() {
        this.slot = nextSlot++;
    };
    _.extend(Meteor.EnvironmentVariable.prototype, {
        get: function() {
            return currentValues[this.slot];
        },
        getOrNullIfOutsideFiber: function() {
            return this.get();
        },
        withValue: function(value, func) {
            var saved = currentValues[this.slot];
            try {
                currentValues[this.slot] = value;
                var ret = func();
            } finally {
                currentValues[this.slot] = saved;
            }
            return ret;
        }
    });
    Meteor.bindEnvironment = function(func, onException, _this) {
        // needed in order to be able to create closures inside func and
        // have the closed variables not change back to their original
        // values
        var boundValues = _.clone(currentValues);
        if (!onException || typeof onException === "string") {
            var description = onException || "callback of async function";
            onException = function(error) {
                Meteor._debug("Exception in " + description + ":", error && error.stack || error);
            };
        }
        return function() {
            var savedValues = currentValues;
            try {
                currentValues = boundValues;
                var ret = func.apply(_this, _.toArray(arguments));
            } catch (e) {
                // note: callback-hook currently relies on the fact that if onException
                // throws in the browser, the wrapped call throws.
                onException(e);
            } finally {
                currentValues = savedValues;
            }
            return ret;
        };
    };
    Meteor._nodeCodeMustBeInFiber = function() {};
    /*
 * ## [new] ReactiveVar(initialValue, [equalsFunc])
 *
 * A ReactiveVar holds a single value that can be get and set,
 * such that calling `set` will invalidate any Computations that
 * called `get`, according to the usual contract for reactive
 * data sources.
 *
 * A ReactiveVar is much like a Session variable -- compare `foo.get()`
 * to `Session.get("foo")` -- but it doesn't have a global name and isn't
 * automatically migrated across hot code pushes.  Also, while Session
 * variables can only hold JSON or EJSON, ReactiveVars can hold any value.
 *
 * An important property of ReactiveVars, which is sometimes the reason
 * to use one, is that setting the value to the same value as before has
 * no effect, meaning ReactiveVars can be used to absorb extra
 * invalidations that wouldn't serve a purpose.  However, by default,
 * ReactiveVars are extremely conservative about what changes they
 * absorb.  Calling `set` with an object argument will *always* trigger
 * invalidations, because even if the new value is `===` the old value,
 * the object may have been mutated.  You can change the default behavior
 * by passing a function of two arguments, `oldValue` and `newValue`,
 * to the constructor as `equalsFunc`.
 *
 * This class is extremely basic right now, but the idea is to evolve
 * it into the ReactiveVar of Geoff's Lickable Forms proposal.
 */
    /**
 * @class 
 * @instanceName reactiveVar
 * @summary Constructor for a ReactiveVar, which represents a single reactive variable.
 * @locus Client
 * @param {Any} initialValue The initial value to set.  `equalsFunc` is ignored when setting the initial value.
 * @param {Function} [equalsFunc] Optional.  A function of two arguments, called on the old value and the new value whenever the ReactiveVar is set.  If it returns true, no set is performed.  If omitted, the default `equalsFunc` returns true if its arguments are `===` and are of type number, boolean, string, undefined, or null.
 */
    ReactiveVar = function(initialValue, equalsFunc) {
        if (!(this instanceof ReactiveVar)) // called without `new`
        return new ReactiveVar(initialValue, equalsFunc);
        this.curValue = initialValue;
        this.equalsFunc = equalsFunc;
        this.dep = new Tracker.Dependency();
    };
    ReactiveVar._isEqual = function(oldValue, newValue) {
        var a = oldValue, b = newValue;
        // Two values are "equal" here if they are `===` and are
        // number, boolean, string, undefined, or null.
        if (a !== b) return false; else return !a || typeof a === "number" || typeof a === "boolean" || typeof a === "string";
    };
    /**
 * @summary Returns the current value of the ReactiveVar, establishing a reactive dependency.
 * @locus Client
 */
    ReactiveVar.prototype.get = function() {
        if (Tracker.active) this.dep.depend();
        return this.curValue;
    };
    /**
 * @summary Sets the current value of the ReactiveVar, invalidating the Computations that called `get` if `newValue` is different from the old value.
 * @locus Client
 * @param {Any} newValue
 */
    ReactiveVar.prototype.set = function(newValue) {
        var oldValue = this.curValue;
        if ((this.equalsFunc || ReactiveVar._isEqual)(oldValue, newValue)) // value is same as last time
        return;
        this.curValue = newValue;
        this.dep.changed();
    };
    ReactiveVar.prototype.toString = function() {
        return "ReactiveVar{" + this.get() + "}";
    };
    ReactiveVar.prototype._numListeners = function() {
        // Tests want to know.
        // Accesses a private field of Tracker.Dependency.
        var count = 0;
        for (var id in this.dep._dependentsById) count++;
        return count;
    };
    // XXX come up with a serialization method which canonicalizes object key
    // order, which would allow us to use objects as values for equals.
    var stringify = function(value) {
        if (value === undefined) return "undefined";
        return EJSON.stringify(value);
    };
    var parse = function(serialized) {
        if (serialized === undefined || serialized === "undefined") return undefined;
        return EJSON.parse(serialized);
    };
    var changed = function(v) {
        v && v.changed();
    };
    // XXX COMPAT WITH 0.9.1 : accept migrationData instead of dictName
    ReactiveDict = function(dictName) {
        // this.keys: key -> value
        if (dictName) {
            if (typeof dictName === "string") {
                // the normal case, argument is a string name.
                // _registerDictForMigrate will throw an error on duplicate name.
                ReactiveDict._registerDictForMigrate(dictName, this);
                this.keys = ReactiveDict._loadMigratedDict(dictName) || {};
            } else if (typeof dictName === "object") {
                // back-compat case: dictName is actually migrationData
                this.keys = dictName;
            } else {
                throw new Error("Invalid ReactiveDict argument: " + dictName);
            }
        } else {
            // no name given; no migration will be performed
            this.keys = {};
        }
        this.allDeps = new Tracker.Dependency();
        this.keyDeps = {};
        // key -> Dependency
        this.keyValueDeps = {};
    };
    _.extend(ReactiveDict.prototype, {
        // set() began as a key/value method, but we are now overloading it
        // to take an object of key/value pairs, similar to backbone
        // http://backbonejs.org/#Model-set
        set: function(keyOrObject, value) {
            var self = this;
            if (typeof keyOrObject === "object" && value === undefined) {
                self._setObject(keyOrObject);
                return;
            }
            // the input isn't an object, so it must be a key
            // and we resume with the rest of the function
            var key = keyOrObject;
            value = stringify(value);
            var oldSerializedValue = "undefined";
            if (_.has(self.keys, key)) oldSerializedValue = self.keys[key];
            if (value === oldSerializedValue) return;
            self.keys[key] = value;
            self.allDeps.changed();
            changed(self.keyDeps[key]);
            if (self.keyValueDeps[key]) {
                changed(self.keyValueDeps[key][oldSerializedValue]);
                changed(self.keyValueDeps[key][value]);
            }
        },
        setDefault: function(key, value) {
            var self = this;
            // for now, explicitly check for undefined, since there is no
            // ReactiveDict.clear().  Later we might have a ReactiveDict.clear(), in which case
            // we should check if it has the key.
            if (self.keys[key] === undefined) {
                self.set(key, value);
            }
        },
        get: function(key) {
            var self = this;
            self._ensureKey(key);
            self.keyDeps[key].depend();
            return parse(self.keys[key]);
        },
        equals: function(key, value) {
            var self = this;
            // Mongo.ObjectID is in the 'mongo' package
            var ObjectID = null;
            if (typeof Mongo !== "undefined") {
                ObjectID = Mongo.ObjectID;
            }
            // We don't allow objects (or arrays that might include objects) for
            // .equals, because JSON.stringify doesn't canonicalize object key
            // order. (We can make equals have the right return value by parsing the
            // current value and using EJSON.equals, but we won't have a canonical
            // element of keyValueDeps[key] to store the dependency.) You can still use
            // "EJSON.equals(reactiveDict.get(key), value)".
            //
            // XXX we could allow arrays as long as we recursively check that there
            // are no objects
            if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && typeof value !== "undefined" && !(value instanceof Date) && !(ObjectID && value instanceof ObjectID) && value !== null) throw new Error("ReactiveDict.equals: value must be scalar");
            var serializedValue = stringify(value);
            if (Tracker.active) {
                self._ensureKey(key);
                if (!_.has(self.keyValueDeps[key], serializedValue)) self.keyValueDeps[key][serializedValue] = new Tracker.Dependency();
                var isNew = self.keyValueDeps[key][serializedValue].depend();
                if (isNew) {
                    Tracker.onInvalidate(function() {
                        // clean up [key][serializedValue] if it's now empty, so we don't
                        // use O(n) memory for n = values seen ever
                        if (!self.keyValueDeps[key][serializedValue].hasDependents()) delete self.keyValueDeps[key][serializedValue];
                    });
                }
            }
            var oldValue = undefined;
            if (_.has(self.keys, key)) oldValue = parse(self.keys[key]);
            return EJSON.equals(oldValue, value);
        },
        all: function() {
            this.allDeps.depend();
            var ret = {};
            _.each(this.keys, function(value, key) {
                ret[key] = parse(value);
            });
            return ret;
        },
        clear: function() {
            var self = this;
            var oldKeys = self.keys;
            self.keys = {};
            self.allDeps.changed();
            _.each(oldKeys, function(value, key) {
                changed(self.keyDeps[key]);
                changed(self.keyValueDeps[key][value]);
                changed(self.keyValueDeps[key]["undefined"]);
            });
        },
        _setObject: function(object) {
            var self = this;
            _.each(object, function(value, key) {
                self.set(key, value);
            });
        },
        _ensureKey: function(key) {
            var self = this;
            if (!(key in self.keyDeps)) {
                self.keyDeps[key] = new Tracker.Dependency();
                self.keyValueDeps[key] = {};
            }
        },
        // Get a JSON value that can be passed to the constructor to
        // create a new ReactiveDict with the same contents as this one
        _getMigrationData: function() {
            // XXX sanitize and make sure it's JSONible?
            return this.keys;
        }
    });
})({}, function() {
    return this;
}());