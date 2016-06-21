var Hoek = require("hoek");
var UUID = require("node-uuid");

var internals = {};

// the validateFunc will be executed on each incoming request 
// (that has been configured with the corresponding authorization strategy)
internals.validateFunc = function(request, cookieData, callback) {
    debugger;

    // cookieData.uuid is the key/id of the session previously set in the cache;
    internals.sessionCache.get(cookieData.uuid, function(err, value, cached, report) {
        debugger;

        var isValid;

        // could not get the session data from catbox (internal error);

        // hapi will call reply.unstate and reply().redirect()
        // (see the source of the callback given to validateFunc -
        // https://github.com/hapijs/hapi-auth-cookie/blob/master/lib/index.js )
        if (err) {
            return callback(err);
        }

        // session data in catbox does not exist or is expired
        // hapi will call reply.unstate and reply().redirect()
        if (!cached) {
            isValid = false;
            return callback(null, isValid);
        }

        //console.log("value: ", value)
        //console.log("REPORT: ", report);
        //console.log("STATS: ", sessionCache.stats);


        // in the request we will have access to both the cookie data and the session object
        //   - the cookie data will be available in request.auth.artifacts
        //   - the session data will be available in request.auth.credentials
        isValid = true;
        return callback(null, isValid, value);
    });

};


exports.register = function(server, options, next){

    // TODO: validate the options with Joi

debugger;

    // create the catbox policy; the underlying catbox client should have been previously configured
    // in the main server configuration (given in the options.policy.cache)
    var sessionCache = internals.sessionCache = server.cache(options.policy);
    server.expose("cache", sessionCache);

    // options for hapi-auth-cookie plugin (which provides the 'cookie' auth scheme);
    var cookieOptions = Hoek.applyToDefaults(options.strategy.cookieOptions, {
        validateFunc: internals.validateFunc
    });

    // registers an authentication strategy using the 'cookie' scheme;
    server.auth.strategy(options.strategy.name, 'cookie', options.strategy.mode, cookieOptions);

    // route where the user/password data is sent to
    server.route({
        path: options.loginPath,
        method: "POST",
        config: {

            handler: function(request, reply) {
                debugger;

                if (request.auth.isAuthenticated) {
                    return reply.redirect(options.successRedirectTo);
                }

                options.validateLoginData(request, function(err, session){

                    if(err){
                        if(err.isBoom && err.output && err.output.statusCode === 401){
                            // the meaning of output.message is overloaded here
                            return reply.redirect(err.message);
                        }

                        return reply(err);
                    }

                    // first, set the session in the internal cache
                    var uuid = UUID.v4();

                    sessionCache.set(

                        // key/id - "'the unique item identifier (within the policy segment)'
                        uuid,

                        //  value to be stored
                        session,

                        // ttl - 'set to 0 to use the caching rules from the Policy initial configuration' ("expiresIn")
                        0,

                        function(err) {
                            debugger;

                            if (err) {
                                console.log(err.message);
                                return reply(err);
                            }

                            // second, set the cookie data; 
                            // it will be simply an object with the uuid of the session
                            var cookieData = {
                                uuid: uuid
                            };
                            request.cookieAuth.set(cookieData);
                            
                            console.log("cookie data: ", cookieData)
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
    // TODO: test this route even if the seesion has already expired
    server.route({
        path: options.logoutPath,
        method: "GET",
        config: {

            handler: function(request, reply) {

debugger;
                if(!request.auth.isAuthenticated){
                    request.cookieAuth.clear();
                    return reply.redirect(options.loginPath);
                }

                var uuid = '';

                // if the request has been authenticated, request.auth.artifacts will
                // have the cookie data
                if(request.auth.artifacts){
                    uuid = request.auth.artifacts.uuid;
                }

                // make sure we actually have a potential valid key (non-empty string)
                if(typeof uuid !== 'string' || uuid.length === 0){
                    request.cookieAuth.clear();
                    return reply.redirect(options.loginPath);
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
