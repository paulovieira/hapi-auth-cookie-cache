# hapi-auth-cookie-memory

## Introduction 

This hapijs plugin combines hapi-auth-cookie and hapi's native caching capabilities (providede by catbox) to provide a simple way authentication system in a hapijs application.

## Description

Assumptions / dependencies:

a) 'cookie' scheme - the 'cookie' authentication scheme must be registered (this scheme is provided by [hapi-auth-cookie](https://github.com/hapijs/hapi-auth-cookie))
b) catbox client - the server must have an instance of some catbox client (could be [catbox-memory](https://github.com/hapijs/catbox-memory) for instance, which is part of hapi core)

When this plugin is registered it will do the following:

- Creates an [authentication strategy](http://hapijs.com/api#serverauthstrategyname-scheme-mode-options) named 'cookie-cache', which uses the 'cookie' authentication scheme. The scheme options can be given in the plugin option 'scheme' (an object). 
- Creates a [catbox policy](http://hapijs.com/api#servercacheoptions) using the name of the catbox client given in the options. The policy options can be given in the plugin option 'policy' (an object).
- Creates 2 routes:
    - One route to handle the submission of the login data (usually the username and password). This route has method POST and the path must be given in the plugin option 'loginDataPath'.
    - One route to handle the logout procedure, which means deleting the cookie in the client and the respective entry in the cache. This route has method GET and the path must be given in the plugin option 'logoutPath'.



### Execute login/authentication logic - validateLoginData

After the login data is submitted by the client to the url defined in 'loginDataPath', the handler (defined by the plugin) will execute the function given in the plugin option 'validateLoginData'. This function has signature `function (request, next)`, so the login data is available at `request.payload`. The authentication logic must be implemented here. 

If it succeeds, the `next` callback should be called with `next(null, cacheMe)`, where `cacheMe` is the value to be stored in the cache. This is usually an object with some details about the client that have been retrieved from a database, such the username, email, etc. A cookie will be sent to the client containing just the uuid of the cached value.

If the authentication fails, the `next` callback should be called with a [Boom](https://github.com/hapijs/boom) error as the 1st argument ([Boom.unauthorized](https://github.com/hapijs/boom#boomunauthorizedmessage-scheme-attributes) would be the correct choice). 
Optionally the plugin can also respond with a redirection (see below).

### Execute logout logic 

To log out, the client must do a GET request to the path given in the 'logoutPath' option. The handler will delete the valued in the cache and clear the cookie in the client. The response will be a redirection to the path given in the plugin option 'logoutRedirectTo' (usually either the homepage or the page with the login form).

## Workflow

Here is a more detailed description of the usual process.

Suppose the client is not authenticated (is not 'logged in').

1) The client visit a page with a form which allow to submit the login data (example: 'GET /login'). This route must be implemented outside of this plugin.

2) The login data is POSTed to the path defined in 'loginDataPath' (example: 'POST /login-data'). The authentication logic must be implemented in the 'validateLoginData' function, which receives the request object in the first argument and a 'next' callback in the second.

If the authentication suceeds, 'next' should be called with an object in the 3rd parameter (credentials object, that is, object with data about the client):
- that object will be stored in the cache 
- a cookie with the uuid of the cached object is sent to the client in the response
- the response will be a redirection (status code 302) to the path given in 'loginRedirectTo' (usually a page with private contents)

If the authentication fails (wrong username or password), the 'next' callback should be called with a Boom error in the 1st parameter and a path in the 2nd (optional):
- If the path was not given in the 2nd parameter, the response will be a simple Boom Boom error;
- If the path was given in the 2nd parameter, the response will be a redirection (302). This is usually the path of the login page (give a new immediate opportunity for the client to submit the login data, with an optional error message to indicate what went wrong).

Note: if the client is already authenticated when the login data is sent (this could happen if the login data was sent in another tab by mistake), the response will simply be a redirection to the path given in 'loginRedirectTo'.

3) After the client is authenticated, all requests to paths/routes that implement the 'cookie-cache' strategy (example: 'GET /dashboard') will be validated. The 'validateFunc' (option for `hapi-auth-cookie`) is implemented by the plugin and has a generic logic:
- retrieve the object from the cache (the cache key is the uuid stored in the cookie)
- if the object doesn't exist or has expired, call the callback passed to 'validateFunc' with false in the 2nd parameter (which results in 'hapi-auth-cookie' clearing the cookie and responding with a 302 redirection)
- if the object exists in the cache and is not expired, call the callback with true in the 2nd parameter and the object in the 3rd (in the handler the object will be available at 'request.auth.credentials').

4) To logout 


If there is a valid cookie but the corresponding object in the cache has expired (or doesn't exist), the response should be a redirection. The path to redirect to should be given separately for each route in 'config.plugins["hapi-auth-cookie"].redirectTo' (usually the page with the login form, having some information for the user about the need to login again). The response with the redirection is done by 'hapi-auth-cookie'.


About the 'redirectTo' option in the route configuration: this option must be given to make hapi-auth-cookie send a redirection in the response when the cookie is invalid


TODO: we might want to register the plugin multiple times (for multiple login systems in the same app); for that we need to spcify the name of the strategy in the optinos

TODO: the login route (outside of the plugin) should not have the redirect option, because otherwise when we access the login page and don't have a cookie (not yet logged in), we end being redirected

4) To logout the client, just do a 'GET /logout' (or something similar). The handler will clear the cookie, delete the entry in the cache and respond with a redirection to the path given in 'logoutRedirectTo' (usually either the homepage or the page with the login form).


NOTE: in step 1, the handler for the '/login' route should have a special logic to check if the client is already authenticated, and if so respond with a redirection (usually to the path given in 'loginRedirectTo'). 

That is, if the client is already logged in and requests the page which allows his/her to be logged in, nothing should happen (it doesn't make sense to show again the pahe with the login form). 
The response should be the same private page that's show right after the client has successfully authenticated.

Also, make sure the route option config.plugins['hapi-auth-cookie'].redirectTo is not defined for '/login', otherwise when we the client accesses that page and don't have yet a cookie (client not yet logged in), the client ends up being redirected.
That option only makes sense for private pages, which is not the case with this one. If the user send an invalid cookie or the cache object has expired/doesn't exist, just proceed to show the page as is expected.

## Reasons for authentication failure (after the client is logged in)

Suppose a client is already authenticated and a request is made to an endpoint configured with the 'cookie-cache' auth strategy and 'try' mode. 
The authentication can fail for different reasons:

1) There is no cookie (it happens when the cookie has expired or has been manually deleted by the client)

The route handler is not executed at all because when the `validate` function from 'hapi-auth-cookie' is executed, the `request.state` object won't have any value for that cookie key.
The `unauthenticated` function is then executed. The response will be either a 302 redirection (if the 'redirectTo' option has been set). In this case the route handler is never reached.


 and the response is given directly from there (so the route handler is never reached).
The response will be either a 401 error ('unauthorized') or a 302 redirection (if the 'redirectTo' option has been set).

2) The cookie is invalid (it happens when the cookie value has been deliberately changed in the client, for instance)

It's as if there was no cookie set because when the cookie data is decrypted (by the 'iron' module) there will be an error due to a bad hmac. The object `request.state` won't have any value for that cookie key, so the code proceeds exactly as in the above case. 

In this case the cookie will also be deleted in the client if the option 'clearInvalid' is true (there is a call to `request._clearState`  in hapi core).

3) The cookie is valid but the uuid doesn't correspond to any value in the cache

When we try to get the cached value (in `validateFunc`) the value will be undefined. The callback to `validateFunc` is called with false in the 2nd argument. 
'hapi-auth-cookie' will then call `unauthenticated`, so the code proceeds as in the above cases. 

In this case the cookie will also be deleted in the client if the option 'clearInvalid' is true (there is a call to `reply.unstate`  just before the call to `unauthenticated`).

4) The cookie is valid and there is a corresponding value in the cache, but it has expired

When we try to get the cached value (in `validateFunc`) the value will be undefined. So this is just like the previous case.

NOTE 1: that an expired value in the cache might or might not be deleted in the database/store. It should be, but that's a concern of the catbox client being used to interface with that database. 
However when we try to get the value using the catbox policy method 'get', the argument in the callback will be null..

NOTE 2: If there is some internal error when obtaining the value from the cache, the callback to `validateFunc` will be called with that error and 'hapi-auth-cookie' will execute the same steps as in case 3.

**Conclusion:** in all the 4 cases, the cookie will be cleared in the client (if it exists) and the response will be a 302 redirection (if the 'redirectTo' option is set for 'hapi-auth-cookie').


---

"Any value provided to reply() (including no value) will be used as the response sent back to the client. 
This means calling reply() with a value in an extension methods or authentication function will be considered an error and **will terminate the request lifecycle.**
But you can use reply.continue() method to instructs the framework to continue processing the request without setting a response (exceptt is the handler function)"

Verify:

1) calling reply(value) in an extension method: 
- boom error: handler WILL NOT execute
- any other value: handler WILL NOT execute
 
2) calling reply(value) in the "authenticate" function from hapi-auth-cookie

route with auth mode 'required':
- boom error: handler WILL NOT execute
- any other value: handler WILL NOT execute

route with auth mode 'try' or 'optional':
- boom error: handler WILL execute(!!!)
- any other value: handler WILL NOT execute

So if always want to reach the handler method, we shouln't be using auth mode 'required'. Use instead 'try'. If there is an autentication failure the plugin should call reply with a Boom error, so the handler WILL be executed. In the handler we should check if the request is authenticated (request.auth.isAuthenticated) and call reply.redirect.
This might be useful because we can give some feedback to the user about why the request did not succeed ('login expired, please login again', or 'you must login first')

NOTE: in hapi-auith-cookie, if redirectTo is used (in the plugin options or in the route config), the plaugin will call reply.redirect(). That's why the handler will not execute. 
If we don't use use redirectTo the plugin will call reply(err), the handler will execute.

---

 

TODO: login is a special endpoint

if we are authenticated, redirect
if we are not, show the page


Do not use the redirectTo option 
make the redirection explicit in the route handler (checking <request class="auth isAuthenticated"></request>)




TODO: instead of setting the redirectTo in the error, check to see if the route has that option 



## Options



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
