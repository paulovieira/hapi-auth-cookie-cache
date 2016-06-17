var Hoek = require("hoek");
var UUID = require("node-uuid");

var internals = {};

exports.register = function(server, options, next){

    // TODO: validate the options with Joi

debugger;

    // create the catbox policy; the underlying catbox client should have been previously configured in the main server configuration
    // (given in the options.policy.cache option)
    var sessionCache = server.cache(options.policy);
    server.expose("cache", sessionCache);

    // registers an authentication strategy using the "cookie" scheme;
    // the scheme is provided by the hapi-auth-cookie plugin, which must be registered before this one

    var cookieOptions = Hoek.clone(options.strategy.cookieOptions);
    cookieOptions.validateFunc = function(request, session, callback) {
        debugger;

        // session[cookieOptions.cookie] is the uuid previously used in sessionCache.set
        var key = cookieOptions.cookie;
        sessionCache.get(session[key], function(err, value, cached, report) {
            debugger;

            // could not get the session data from catbox (internal error)
            if (err) {
                return callback(err);
            }

            // session data in catbox is invalid or does not exist
            if (!cached) {
                return callback(null, false);
            }

            return callback(null, true, value);
        });

        console.log(sessionCache.stats);
    };

    server.auth.strategy(options.strategy.name, "cookie", options.strategy.mode, cookieOptions);

    // login route
    server.route({
        path: options.loginPath,
        method: "POST",
        config: {

            handler: function(request, reply) {
                debugger;

                if (request.auth.isAuthenticated) {
                    return reply.redirect(options.successRedirectTo);
                }

                // TODO: the logic to check the password should be extracted

                // sync method
                options.validateLoginData(request, function(err, loginData){

                    if(err){
                        if(err.output && err.output.statusCode === 401){
                            // the meaning of output.message is overloaded here
                            return reply.redirect(err.message);
                        }

                        return reply(err);
                    }

                    // we now set the session in the internal cache (Catbox with memory adapter)
                    var newSession = {
                        uuid: UUID.v4(),
                        loginData: loginData
                    };

                    // store an item in the cache
                    console.log("newSession: ", newSession)
                    sessionCache.set(

                        // id - the unique item identifier (within the policy segment)
                        newSession.uuid,

                        //  value to be stored
                        newSession,

                        // ttl - set to 0 to use the caching rules from the Policy initial configuration ("expiresIn")
                        0,

                        function(err) {
                            debugger;

                            if (err) {
                                console.log(err.message);
                                return reply(err);
                            }

                            var cookieCrumb = {};
                            cookieCrumb[cookieOptions.cookie] = newSession.uuid;

                            request.cookieAuth.set(cookieCrumb);
                            
                            console.log("cookie was set")
                            return reply.redirect(options.successRedirectTo);
                        }
                    );

                });

            },

            auth: {
                strategy: options.strategy.name,
                mode: "try"
            },

            plugins: {

                "hapi-auth-cookie": {
                    redirectTo: false
                }
            }

        }
    });

    // logout route
    server.route({
        path: options.logoutPath,
        method: "GET",
        config: {

            handler: function(request, reply) {

debugger;
                if(!request.auth.isAuthenticated){
                    return reply.redirect(options.loginPath);
                }

                var uuid;
                if(request.auth.artifacts){

                    uuid = request.auth.artifacts[cookieOptions.cookie];
                }

                sessionCache.drop(uuid, function(err){
debugger;
                    if(err){
                        return reply(err);
                    }

                    request.cookieAuth.clear();
                    return reply.redirect(options.loginPath);
                });
            },

            auth: {
                strategy: options.strategy.name,
                mode: "try"
            },

            plugins: {

                "hapi-auth-cookie": {
                    redirectTo: false
                }
            }
        }
    });

    return next();

};

exports.register.attributes = {
    name: "hapi-auth-session",
    dependencies: ["hapi-auth-cookie"]
};
