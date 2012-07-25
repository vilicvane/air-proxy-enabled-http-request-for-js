/*
    Adobe AIR Proxy Enabled HTTP Request for JavaScript
    By VILIC VANE
    Blog: www.vilic.info
    Email: i@vilic.info

    *Requires VEJIS 0.4*
    https://github.com/vilic/vejis

    *It does only support HTTP, not including HTTPS.*

    Basic usage:

    use_("http-request", function (hr) {

        var req = new hr.Request();

        //you can turn off cookies
        //req.cookieEnabled = false;

        //or turn off auto redirect
        //req.autoRedirect = false;

        req.proxy.host = "localhost";
        req.proxy.port = 1107;

        req.open("get", "http://www.vilic.info/blog/");

        //you can set request headers
        //req.setRequestHeader("Referer", "http://www.vilic.info/");

        req.send(function (req) {
            if (req.error) {
                alert(req.error);
                return;
            }

            alert(req.status);
            alert(req.responseText);
        });

        //if you use post, you'll also need to send the data
        //string and ByteArray are supported
        //req.send(data, callback);

    });

    For full usage, please check the source code. :D
*/

module_("http-request", function () {
    var hr = this;

    this.defaultProxies = [];

    var proxyPos = 0;

    this.getProxy = function () {
        var proxies = hr.defaultProxies;
        if (proxyPos >= proxies.length)
            proxyPos = 0;

        if (proxies[proxyPos]) {
            var proxy = proxies[proxyPos++];
            return {
                host: proxy.host,
                port: proxy.port
            };
        }
        else {
            return {
                host: undefined,
                port: undefined
            };
        }
    };

    this.FormData = function () {
        var that = this;
        var data = {};

        this.add = _(String, Object, function (name, value) {
            if (data["#" + name])
                data["#" + name].push(encodeURIComponent(value));
            else
                data["#" + name] = [encodeURIComponent(value)];
        });

        this.set = _(String, Object, function (name, value) {
            that.remove(name);
            that.add(name, value);
        });

        this.set._(PlainObject, function (data) {
            forin_(data, function (value, name) {
                that.set(name, value);
            });
        });

        this.remove = _(String, function (name) {
            delete data["#" + name];
        });

        this.toString = function () {
            var strs = [];
            for (var i in data)
                if (i.indexOf("#") == 0)
                    for (var j = 0; j < data[i].length; j++)
                        strs.push(i.substr(1) + "=" + data[i][j]);
            return strs.join("&");
        };
    };

    this.Url = function (urlStr) {
        var urlRe = /^(\w+):\/\/([a-z0-9-.]+)(?::(\d+))?(?:(\/)(.*))?$/;

        var groups = urlRe.exec(urlStr);

        if (!groups)
            throw new Error("Illegal url.\n" + urlStr);

        if (!groups[4])
            urlStr += "/";

        this.protocol = groups[1].toLowerCase();
        this.host = groups[2].toLowerCase();
        this.port = Number(groups[3] || 80);
        this.path = groups[5] || "";

        this.toString = function () { return urlStr; };
    };

    this.CookieContainer = function () {
        var cookiesItems = {};

        this.__defineGetter__("items", function () { return cookiesItems; });
        this.__defineSetter__("items", function (value) {
            if (is_(value, PlainObject))
                cookiesItems = value;
        });

        this.set = function (domain, name, value, expires) {
            domain = domain.toLowerCase();

            if (!cookiesItems.hasOwnProperty(domain))
                cookiesItems[domain] = {};

            var cookies = cookiesItems[domain];
            if (expires <= new Date())
                delete cookies[name];
            else {
                cookies[name] = {
                    value: value,
                    expires: expires
                };
            }
        };

        this.remove = function (domain, name) {
            domain = domain.toLowerCase();
            if (cookiesItems.hasOwnProperty[domain]) {
                var cookies = cookiesItems[domain];
                delete cookies[name];
            }
        };

        this.clear = function (domain) {
            var domains = getDomains(domain);
            for_(domains, function (domain) {
                delete cookiesItems[domain];
            });
        };

        this.get = function (domain, name) {
            var domains = getDomains(domain);

            for (var i = 0; i < domains.length; i++) {
                domain = domains[i];
                if (cookiesItems.hasOwnProperty(domain)) {
                    var cookies = cookiesItems[domain];
                    if (cookies.hasOwnProperty(name)) {
                        var cookie = cookies[name];
                        if (cookie.expires && new Date(cookie.expires) <= new Date())
                            delete cookies[name];
                        else
                            return cookie;
                    }
                }
            }

            return null;
        };

        this.getLine = function (domain) {
            var strs = [];

            var domains = getDomains(domain);

            for (var i = 0; i < domains.length; i++) {
                domain = domains[i];
                if (cookiesItems.hasOwnProperty(domain)) {
                    var cookies = cookiesItems[domain];

                    for (var i in cookies) {
                        if (cookies.hasOwnProperty(i)) {
                            var cookie = cookies[i];
                            if (cookie.expires && new Date(cookie.expires) <= new Date())
                                delete cookies[i];
                            else
                                strs.push(i + "=" + cookies[i].value);
                        }
                    }
                }
            }

            return strs.join("; ");
        };

        function getDomains(domain) {
            domain = domain.toLowerCase();
            var domains = [domain];

            //if not a IP
            if (!/\d$/.test(domain)) {
                var index;

                while ((index = domain.indexOf(".")) >= 0) {
                    domains.push(domain);
                    domain = domain.substr(index + 1);
                }
            }
            return domains;
        }
    };

    hr.CookieContainer.__defineGetter__("defaultCookieContainer", function () { return defaultCookieContainer; });

    var defaultCookieContainer = new hr.CookieContainer();

    this.Request = function () {
        var that = this;

        var socket;

        this.proxy = hr.getProxy();

        this.cookieEnabled = true;
        this.autoRedirect = true;

        var cookieContainer = defaultCookieContainer;

        var url;
        var requestUrl;
        var requestMethod;

        var opened = false;

        var proxyEnabled;

        var requestHeaders;
        var responseHeaders;
        var responseHeaderLines;

        var responseHeaderComplete;

        var error;

        var responseBody;
        var responseText;
        var status;
        var contentType;
        var charset;
        var contentLength;
        var location;
        var ready;
        var chunked;
        var chunkRemain;
        var aborted;

        this.setRequestHeader = function (name, value) {
            var nameLC = name.toLowerCase();
            if (requestHeaders.hasOwnProperty(nameLC))
                requestHeaders[nameLC].value = value;
            else {
                requestHeaders[nameLC] = {
                    name: name,
                    value: value
                };
            }
        };

        this.removeRequestHeader = function (name) {
            var nameLC = name.toLowerCase();
            delete requestHeaders[nameLC];
        };

        this.getResponseHeader = function (name) {
            var nameLC = name.toLowerCase();
            if (responseHeaders.hasOwnProperty(nameLC))
                return responseHeaders[nameLC];
        };

        this.__defineGetter__("responseBody", function () { return responseBody; });
        this.__defineGetter__("responseText", function () {
            if (typeof responseText == "undefined")
                responseText = "";

            if (responseBody)
                responseText += responseBody.readMultiByte(responseBody.bytesAvailable, charset);

            return responseText;
        });

        this.__defineGetter__("status", function () { return status; });
        this.__defineGetter__("contentType", function () { return contentType; });
        this.__defineGetter__("contentLength", function () { return contentLength; });
        this.__defineGetter__("location", function () { return location; });
        this.__defineGetter__("url", function () { return url.toString(); });

        this.__defineGetter__("error", function () { return error; });
        this.__defineGetter__("aborted", function () { return aborted; });

        this.__defineGetter__("cookieContainer", function () { return cookieContainer; });
        this.__defineSetter__("cookieContainer", function (container) {
            if (is_(container, hr.CookieContainer))
                cookieContainer = container;
            else
                throw new Error("Invalid value for cookieContainer");
        });

        var completeCallback;

        this.open = _(String, String, function (method, url) {
            if (opened)
                throw new Error("already opened");
            requestMethod = method;
            requestUrl = url;
            init();
            opened = true;
        });

        this.send = _(Object, Function, function (data, callback) {
            if (!opened)
                throw new Error("not opened");

            completeCallback = callback || function () { };

            var dataBytes;

            if (data == null)
                data = "";

            if (data.constructor == air.ByteArray)
                dataBytes = data;
            else {
                dataBytes = new air.ByteArray();
                dataBytes.writeUTFBytes(data.toString());
            }

            request(requestMethod, requestUrl, dataBytes);
        });

        this.send._(Function, function (callback) {
            that.send("", callback);
        });

        this.abort = _(function () {
            aborted = true;
            closeSocket();
            complete();
        });

        function onioerror(e) {
            error = e.toString();
            complete();
        }

        function ondata() {

            if (!responseHeaderComplete) (function () {
                var line;
                while (line = readLine())
                    responseHeaderLines.push(line);

                if (line == "") {
                    responseHeaderComplete = true;

                    "process response headers",
                    function () {
                        var statusRe = / (\d+)/;
                        status = Number(statusRe.exec(responseHeaderLines[0])[1]);

                        var lines = responseHeaderLines;

                        /*
                        air.trace("\n- RESPONSE HEADER -");
                        air.trace(lines.join("\n"));
                        air.trace("-\n");
                        */

                        for (var i = 1; i < lines.length; i++) {
                            var line = lines[i];
                            var index = line.indexOf(":");

                            var name = line.substr(0, index).toLowerCase();
                            var value = line.substr(index + 1).replace(/^\s+/, "");

                            if (name == "set-cookie") {
                                if (that.cookieEnabled) {
                                    "process set cookie",
                                    function () {
                                        var re;
                                        var groups;

                                        re = /^([^=]+)=([^;]*)/;
                                        groups = re.exec(value);

                                        var cname = groups[1];
                                        var cvalue = groups[2];

                                        re = /; *([^=]+)=([^;]*)/g;

                                        var infos = {};
                                        while (groups = re.exec(value))
                                            infos[groups[1].toLowerCase()] = groups[2];

                                        var cdomain = url.host;
                                        if (infos.hasOwnProperty("domain"))
                                            cdomain = infos["domain"].replace(/^\./, "");

                                        cookieContainer.set(cdomain, cname, cvalue, new Date(infos["expires"]));

                                    } ();
                                }
                            }
                            else
                                responseHeaders[name] = value;
                        }


                    } ();

                    var oLocation = that.getResponseHeader("Location");

                    if (oLocation) {
                        if (/^\w+:\/\//.test(oLocation))
                            location = oLocation;
                        else if (/^\/\//.test(location))
                            location = url.protocal + ":" + location;
                        else if (/^\//.test(oLocation))
                            location = url.protocol + "://" + url.host + (url.port == 80 ? "" : ":" + url.port) + oLocation;
                        else
                            location = url + oLocation;
                    }

                    if ((status >= 300 && status < 400 || status == 201) && location && that.autoRedirect) {
                        var nurl = location;
                        init();
                        request("GET", nurl);
                        return;
                    }

                    contentType = that.getResponseHeader("Content-Type");
                    contentLength = Number(that.getResponseHeader("Content-Length"));

                    chunked = /chunked/i.test(that.getResponseHeader("Transfer-Encoding"));
                    charset = (/(?:^|[; ])charset=([^;]+)/i.exec(contentType) || ["", "utf-8"])[1].toLowerCase();
                }
            })();

            if (responseHeaderComplete) (function () {
                if (!responseBody)
                    responseBody = new air.ByteArray();

                if (chunked) {
                    while (socket.bytesAvailable) {
                        //ready to read another chunk
                        if (chunkRemain == -1) {

                            var line = readLine();
                            if (line) {
                                chunkRemain = parseInt(line, 16);

                                if (chunkRemain == 0)
                                    chunkRemain = -2; //mark for reading last "\r\n"

                            }
                            else return; //no enough data
                        }

                        if (chunkRemain == -2) {
                            var line = readLine();
                            if (line == "") {
                                chunkRemain = -1;
                                done();
                                return;
                            }
                        }

                        if (chunkRemain > 0) {

                            var size = Math.min(chunkRemain, socket.bytesAvailable);
                            chunkRemain -= size;
                            socket.readBytes(responseBody, responseBody.length, size);
                        }

                        if (chunkRemain == 0) {
                            if (readLine() == "")
                                chunkRemain = -1;
                        }
                    }
                }
                else {
                    socket.readBytes(responseBody, responseBody.length);

                    if (responseBody.length >= contentLength)
                        done();
                }

                function done() {
                    socket.close();
                    complete();
                }
            })();
        }

        function onclose() {
            if (!ready)
                complete();
        }

        function complete() {
            ready = true;
            opened = false;
            if (!aborted)
                completeCallback(that);
        }

        function init() {

            requestHeaders = {};
            responseHeaders = {};
            responseHeaderLines = [];
            responseHeaderComplete = false;
            ready = false;
            chunked = false;
            chunkRemain = -1;

            error = null;
            proxyEnabled = undefined;

            responseBody = null;
            responseText = undefined;
            status = undefined;
            contentType = undefined;
            charset = undefined;
            contentLength = undefined;
            location = undefined;

            aborted = false;

            closeSocket();
            createSocket();
        }

        function closeSocket() {
            if (socket) {
                try {
                    socket.close();
                } catch (e) { }
                socket.removeEventListener(air.ProgressEvent.SOCKET_DATA, ondata);
                socket.removeEventListener(air.Event.CLOSE, onclose);
                socket.removeEventListener(air.IOErrorEvent.IO_ERROR, onioerror);
            }
        }

        function createSocket() {
            socket = new air.Socket();
            socket.addEventListener(air.ProgressEvent.SOCKET_DATA, ondata);
            socket.addEventListener(air.Event.CLOSE, onclose);
            socket.addEventListener(air.IOErrorEvent.IO_ERROR, onioerror);
        }

        function readLine() {
            var line = readLine.preRead || "";
            var complete = false;

            while (true) {
                if (!socket.bytesAvailable) {
                    readLine.preRead = line;
                    break;
                }

                var chr = String.fromCharCode(socket.readByte());

                if (chr != "\n")
                    line += chr;
                else {
                    line = line.match(/.*/)[0];
                    readLine.preRead = "";
                    complete = true;
                    break;
                }
            }

            return complete ? line : null;
        }

        function request(method, urlStr, dataBytes) {
            method = method.toUpperCase();
            if (!/^(POST|GET)$/.test(method))
                throw new Error("Only GET or POST method is supported.");

            url = new hr.Url(urlStr);
            if (!/^(http)$/.test(url.protocol))
                throw new Error("Protocol not supported.");

            //air.trace(urlStr);

            if (that.proxy.host && that.proxy.port > 0) {
                proxyEnabled = true;
                socket.connect(that.proxy.host, that.proxy.port);
            }
            else {
                proxyEnabled = false;
                socket.connect(url.host, url.port);
            }

            var headerLines = [method + " " + (proxyEnabled ? url : "/" + url.path) + " HTTP/1.1"];

            that.setRequestHeader("Host", url.host);

            if (that.cookieEnabled) {
                var cookie = cookieContainer.getLine(url.host);
                if (cookie)
                    that.setRequestHeader("Cookie", cookie);
            }

            if (method == "POST")
                that.setRequestHeader("Content-Length", dataBytes.length);

            that.setRequestHeader("Connection", "close");

            for (var i in requestHeaders) {
                if (requestHeaders.hasOwnProperty(i)) {
                    var header = requestHeaders[i];
                    headerLines.push(header.name + ": " + header.value);
                }
            }


            var header = headerLines.join("\r\n");

            /*
            air.trace("\n- REQUEST HEADER -");
            air.trace(header);
            air.trace("-\n");
            */

            header += "\r\n\r\n";

            socket.writeUTFBytes(header);

            if (method == "POST")
                socket.writeBytes(dataBytes);

            socket.flush();
        }
    };
});
