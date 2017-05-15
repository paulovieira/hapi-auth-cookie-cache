'use strict';

const Hapi = require('hapi');

const internals = {};
internals['30 seconds'] = 5 * 1000;
internals['1 year'] = 365 * 24 * 60 * 60 * 1000;

internals.users = [
    {
        username: 'john',
        password: 'password',
        fullName: 'John Doe'
    },
    {
        username: 'mary',
        password: 'password2',
        fullName: 'Mary Doe'
    }
];

// codes with expected reasons for an authentication failure (used to give feedback to the user about what went wrong)

const DATA_NOT_SUBMITTED = 1;
const UNKNOWN_USERNAME = 2;
const WRONG_PASSWORD = 3;
const EXPIRED = 4;

internals.authFailReasons = {};
internals.authFailReasons[DATA_NOT_SUBMITTED] = 'Please submit the username or password';
internals.authFailReasons[UNKNOWN_USERNAME] = 'The submitted username does not exist';
internals.authFailReasons[WRONG_PASSWORD] = 'The submitted password is wrong';
internals.authFailReasons[EXPIRED] = 'Your session has expired. Please login again.';


const server = new Hapi.Server({
    cache: {
        name: 'my-memory-cache',
        engine: require('catbox-memory')
    }
});

server.connection({ 
    port: 8000
});


// plugin configuration objects
const AuthCookie = {
    register: require('hapi-auth-cookie'),
    options: {}
};

const AuthCookieCache = {
    register: require('..'),
    options: {

        // options for the cache policy

        policy: {
            cache: 'my-memory-cache',
            segment: 'sessions',
            expiresIn: internals['30 seconds']
        },

        // options for the cookie scheme (implemented by hapi-auth-cookie)

        strategyName: 'cookie-cache',
        scheme: {

            password: 'something-very-random-and-must-have-at-least-32-chars',
            isSecure: false,

            // erase the cookie if the cached data has expired (or some other error has happened)
            clearInvalid: true,

            // if auth mode is 'try' and if the validation fails (no cookie, for instance), will send a 
            // 302 response using reply.redirect(); the url should be given in the route configuration, 
            // at 'plugins.["hapi-auth-cookie"].redirectTo'; 
            // if 'redirectTo' is missing, it has no effect (that is, hapi will reply normally, as if the 
            // route had auth === false);

            // note: if strategy mode is 'optional', it works the same way (but it seems to be a bug in hapi-auth-cookie)
            redirectOnTry: false,

            // important: do not set redirectTo here, use instead the route level configuration at
            // config.plugins.["hapi-auth-cookie"].redirectTo
            //redirectTo: '',

            //appendNext: true,

            // use a long ttl for the cookie; the cookie will actually be cleared when the 
            // client data in the cache has expired, so the option that actually matter is policy.expiresIn;
            // note that in this case (when the cached data has expired) the clearing of the cookie
            // happens in hapi-auth-cookie, at the callback given to 'validateFunc'; the cookie will
            // be cleared for for 2 reasons: 
            //  a) we are calling calling the callback with false in the 2nd arg ('isValid')
            //  b) the clearInvalid option is true
            ttl: internals['1 year']
        },

        // url to send the login data (usually username + password); the plugin will create a POST route;
        // the page containing the form to submit the credentials must be implemented by the application;
        // the logic to validate the data must be implemented in the 'validateLoginData' callback (which
        // includes the url to direct to after the validation)
        loginDataPath: '/login-data',

        // url to logout the user; the plugin will create a GET route; the handler will execute the tasks
        // that correspond to a logout - clear the plugin cookie, clear the session in the cache; 
        // the response will be a redirection to the url given in logoutRedirectTo
        logoutPath: '/logout',

        // url to redirect to after the logout tasks are executed; can be overriden using a query string with 
        // the same key;
        logoutRedirectTo: '/',
        /*
        logoutRedirectTo: function (request, reply) {

            console.log('logging out: ', request.auth.credentials);
            return reply('You are being redirected...').redirect('/login');
        },
        */
 
        validateLoginData: function (request, next){

            const submittedUsername = request.payload.username;
            const submittedPassword = request.payload.password;

            // try to find the user in the database
            const dbUser = internals.users.find(obj => obj.username === submittedUsername);

            let failReason = 0;

            // Possible reasons for authentication to fail:
            //   - missing username or password
            //   - username does not exist in the database
            //   - wrong password (username exists but password doesn't match)

            if (!submittedUsername || !submittedPassword) {
                failReason = DATA_NOT_SUBMITTED;
            }
            else if (dbUser === undefined){
                failReason = UNKNOWN_USERNAME;
            }
            else if (dbUser.password !== submittedPassword){
                failReason = WRONG_PASSWORD;
            }

            let isValid, sessionData, redirectTo;

            if (failReason > 0){
                isValid = false;
                sessionData = null;
                redirectTo = `/login?auth-fail-reason=${ failReason }`;
            }
            else {
                // username/password are valid; define the session object to be stored
                // in the cache (using the catbox policy created internally by the plugin)

                isValid = true;
                sessionData = {
                    username: dbUser.username,
                    fullName: dbUser.fullName
                };
                redirectTo = `/dashboard?dummy-query-string=${ Date.now() }`;
            }

            return next(null, isValid, sessionData, redirectTo);
        }
    }
};


server.register([AuthCookie, AuthCookieCache], (err) => {

    if (err) {
        throw err;
    }

    server.route({
        method: 'GET',
        path: '/',
        handler: function (request, reply) {

            console.log('/');

            let dynamicHtml = '';

            if (request.auth.isAuthenticated){
                dynamicHtml = `
                    <span style="background: cyan">You're logged as ${ request.auth.credentials.fullName }. </span> <br><br>

                    <a href="/dashboard">Dashboard</a> <br>
                    <a href="/logout">Logout (will clear the cookie)</a>
                `;
            }
            else {
                dynamicHtml = '<a href="/login">Login</a>';
            }

            const html = `
                <html><body>

                    <h1>Welcome to the home page</h1>
                    This page can always be accessed but the content depends on whether the request is authenticated or not <br><br>
                    ${ dynamicHtml }
                
                </body></html>
            `;
            
            return reply(html);
        },
        config: {
            auth: {
                strategy: 'cookie-cache',
                mode: 'try'
            }
        }

    });

    server.route({
        method: 'GET',
        path: '/login',
        handler: function (request, reply) {

            console.log('/login');

            if (request.auth.isAuthenticated) {
                return reply.redirect('/dashboard');
            }
            
            const failReasonCode = request.query['auth-fail-reason'];
            const dynamicHtml = `<span style="background: red"> ${ internals.authFailReasons[failReasonCode] || '' } </span> <br><br>`;

            const html = `
                <html><body>

                    <h1>Welcome to the login page</h1>
                    This page can always be accessed but if the request is already authenticated the response will be a redirect <br><br>
                    <form method="post" action="/login-data">
                        Username: <input type="text" name="username"> <br>
                        Password: <input type="password" name="password"> <br>
                        <input type="submit">
                    </form>

                    ${ dynamicHtml }

                    <a href="/">Home</a>

                </body></html>
            `;

            return reply(html);
        },
        config: {
            auth: {
                strategy: 'cookie-cache',
                mode: 'try'
            }
        }
    });

    server.route({
        method: 'GET',
        path: '/dashboard',
        handler: function (request, reply) {

            console.log('/dasboard');

            if (!request.auth.isAuthenticated) {

                // check if this request has session data (which means we have an expired session, since isAuthenticated is false)
                if (request.auth.artifacts && request.auth.artifacts.uuid) {
                    const failReason = EXPIRED;
                    return reply.redirect(`/login?auth-fail-reason=${ failReason }`);
                }
                else {
                    return reply.redirect('/login');
                }
            }

            const html = `
                <html><body>

                    <h1>Welcome to the dashboard, ${ request.auth.credentials.fullName }!</h1>
                    This page can only be accessed if the request is authenticated <br><br>

                    <a href="/">Home</a> <br>
                    <a href="/logout?logoutRedirectTo=/login">Logout (will clear the cookie)</a>

                </body></html>
            `;

            return reply(html);
        },
        config: {
            auth: {
                strategy: 'cookie-cache',
                mode: 'try'
            }
        }
    });

    server.ext('onPreHandler', function(request, reply) {

        console.log('onPreHandler a', request.path);
        return reply.continue();
    });

    server.ext({
        type: 'onRequest',
        method: function(request, reply) {

            console.log('onRequest 1 ', request.path);
            return reply.continue();
        },
        options: {
            sandbox: 'connection'
        }
    });

    server.ext('onRequest', function(request, reply) {

        console.log('onRequest 2 ', request.path);
        return reply.continue();
    });

    server.start(() => {

        console.log('Server running at:', server.info.uri);
    });
});
