## hapi-auth-session


in the main configuration of the server, provide options to create a new catbox client (using, for instance, the "catbox-memory" strategy)

```js
    server: {

        cache: {
            name: "sessionCache",
            engine: require("catbox-memory"),
            partition: "sessionCachePartition"
        }
```

this plugin will do 2 things:

a) create a catbox policy using the one of the catbox client previously configured
b) create an authentication strategy using the "cookie" scheme (provided by the hapi-auth-cookie plugin)


options:

    // catbox policy options; this object will be given directly to server.cache
    // http://hapijs.com/api#servercacheoptions
    policy: {
        cache - the name of the catbox client given above
        segment - the name of the segment to be used in the catbox policy (default: sessionCacheSegment)

    },

    // authentication strategy options:
    http://hapijs.com/api#serverauthstrategyname-scheme-mode-options
    strategy: {
        name:
        mode: 
        scheme: {
            password: ...,
            isSecure: ...,    
        }

        
    },
    loginPath
    logoutPath
    validateLoginData
    successRedirectTo




1) 
a POST request is made to options.loginPath;

options.validateLoginData is executed and is given the request object and a callback.

validateLoginData should implement the logic to verify if the data sent in the request (via query string, form data, custom headers, etc) is correct; this will probably involve a call to the database;

if it is not correct, execute the callback with a Boom.unauthorized object in the 1st arg; otherwise, execute the callback with the session data in the 2nd arg; 

this session data will be stored in the cache using catbox's 'set' method ('sessionCache.set'); the corresponding key will be a uuid generated on the fly (note: this key is not the cookie's key);

the cookie data is just an object with the uuid relative to the session:
{"uuid":"92f987f7-c4c9-4a7b-abf8-84cc4fbb35ad"}
it is set with the 'request.cookieAuth.set' (from hapi-auth-cookie)

finally, the response to the POST request is a 302 redirection to the url given in options.successRedirectTo (done via 'reply.redirect')

2)
on each request that required authentication, the validateFunc defined in the plugin is executed;
this function will be given the cookie data (which has some uuid);

it will try to get the session data from the cache, using sessionCache.get;

if there is an error or if there is no data (because the session migt have expired meanwhile), it will call the callback with false in the 2nd arg; this will make the hapi-auth-cookie plugin clear the cookie;

otherwise, it will call the callback with true in the 2nd arg and the session data in the 3rd arg; this will make the request continue to the next step; at the handler, the session data will be available in request.auth.credentials and the cookie data will be available in request.auth.artifacts

3) 
to logout, simply make a GET request to options.logoutPath;

it will drop the session data from the cache with sessionCache.drop;

it will clear the cookie with request.cookieAuth.clear

the response is a 302 redirection to the url given in options.loginPath (done via 'reply.redirect'), that is, send the user back to the login form page
