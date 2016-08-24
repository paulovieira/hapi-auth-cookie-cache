'use strict';

const UUID = require('node-uuid');
const internals = {};

// generic validateFunc - will be executed on each incoming request
// for routes configured with the hapi-auth-cookie-cache strategy;
// see hapi-auth-cookie docs for more details about this function
internals.validateFunc = function (request, cookieData, callback) {

    // cookieData is an object of the form { uuid: ... }, where uuid is the key/id of the object 
    // previously set in the cache (the 'session' object, though this term is a but ambiguous)
    console.log('cookieData', cookieData);

    debugger;
    let isValid = undefined;
    const uuid = cookieData.uuid;

    // if there is no uuid, this must be an invalid cookie - execute the callback
    // with isValid === false; hapi-auth-cookie will call reply.unstate and reply().redirect()
    // the refirection url should be given in the route configuration at
    // config.plugins["hapi-auth-cookie"].redirectTo
    if (!uuid){
        isValid = false;
        return callback(null, isValid);
    }

    internals.cookieCache.get(uuid, function (err, value, cached, report) {

        // catbox failed to retrieve the cached data (internal error);
        // hapi will call reply.unstate and reply().redirect()
        // (see the source of the callback given to validateFunc -
        // https://github.com/hapijs/hapi-auth-cookie/blob/master/lib/index.js )
        debugger;
        if (err) {
            return callback(err);
        }

        // the cached object does not exist or is expired - execute the callback
        // with isValid === false; hapi will call reply.unstate and reply().redirect()
        if (!cached) {
            isValid = false;
            return callback(null, isValid);
        }

        //console.log("value: ", value)
        //console.log("REPORT: ", report);
        //console.log("STATS: ", cookieCache.stats);

        // if we arrived here, there is some object in the cache whose key is the 
        // uuid given by the cookie data; this means the user is authenticated

        // in the request handler we will have access to both the cookie data and the cached object
        // - the cookie data object will be available at request.auth.artifacts
        // - the cached object will be available at request.auth.credentials
        isValid = true;
        return callback(null, isValid, value);
    });

};


exports.register = function (server, options, next){

    // TODO: validate the options with Joi

    //debugger;
    options.scheme = options.scheme || {};
    options.policy = options.policy || {};

    // quick and dirty validation
    if (options.scheme.validateFunc){
        return next(new Error('The options for the "cookie" scheme cannot have the "validateFunc" property'));
    }

    if (!options.policy.cache){
        return next(new Error('The options for the catbox policy must have a "cache" property'));
    }



    // create the catbox policy; the underlying catbox client should have been previously configured
    // in the main server configuration (given by options.policy.cache)
    internals.cookieCache = server.cache(options.policy);
    const cookieCache = internals.cookieCache;
    server.expose('cookieCache', cookieCache);

    // options for 'cookie' scheme (implemented hapi-auth-cookie);

    options.scheme.validateFunc = internals.validateFunc;

    // registers an authentication strategy using the 'cookie' scheme; we explicitely
    // give the strategy mode (false), which is the default value; false means that
    // routes WITHOUT an 'auth' config will NOT have this strategy as the default one;
    // note that the strategy mode can be (and should be) configured per route (config.auth.mode)
    server.auth.strategy('cookie-cache', 'cookie', false, options.scheme);

    // route where the user/password data is sent to
    server.route({
        path: options.loginDataPath,
        method: 'POST',
        config: {

            handler: function (request, reply) {

                debugger;

                //console.log('request.auth', request.auth)
                if (request.auth.isAuthenticated) {
                    return reply.redirect(options.loginRedirectTo);
                }

                options.validateLoginData(request, function (err, clientData){

                    if (err){
                        if (err.redirectTo){
                            return reply.redirect(err.redirectTo);
                        }

                        return reply(err);
                    }

                    // 1) set the clientData object in the internal cache
                    const uuid = UUID.v4();

                    cookieCache.set(

                        // key/id - ''the unique item identifier (within the policy segment)'
                        uuid,

                        //  value to be stored
                        clientData,

                        // ttl - 'set to 0 to use the caching rules from the Policy initial configuration' ('expiresIn')
                        0,

                        function (err){

                            //debugger;

                            if (err) {
                                console.log(err.message);
                                return reply(err);
                            }

                            // 2) set the cookie data; it will be simply an object with the
                            // uuid of the cached object (like a foreign key in SQL)
                            const cookieData = {
                                uuid: uuid
                            };
                            request.cookieAuth.set(cookieData);

                            console.log('cookie data: ', cookieData);
                            return reply.redirect(options.loginRedirectTo);
                        }
                    );

                });

            },

            auth: {
                strategy: 'cookie-cache',
                mode: 'try'
            }
        }
    });

    // logout route
    server.route({
        path: options.logoutPath,
        method: 'GET',
        config: {

            handler: function (request, reply){

                //debugger;
                if (!request.auth.isAuthenticated){
                    request.cookieAuth.clear();
                    return reply.redirect(options.logoutRedirectTo);
                }

                let uuid = '';

                // if the request has been authenticated, request.auth.artifacts will
                // have the cookie data
                if (request.auth.artifacts){
                    uuid = request.auth.artifacts.uuid;
                }

                // make sure we actually have a potential valid key (non-empty string)
                if (typeof uuid !== 'string' || uuid.length === 0){
                    request.cookieAuth.clear();
                    return reply.redirect(options.logoutRedirectTo);
                }

                cookieCache.drop(uuid, function (err){

                    debugger;
                    if (err){
                        return reply(err);
                    }

                    request.cookieAuth.clear();
                    return reply.redirect(options.logoutRedirectTo);
                });
            },

            auth: {
                strategy: 'cookie-cache',
                mode: 'try'
            }

        }
    });

    return next();

};

exports.register.attributes = {
    name: 'hapi-auth-cookie-cache',
    dependencies: ['hapi-auth-cookie']
};
