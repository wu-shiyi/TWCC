/**
 * This file is part of TWCC.
 *
 * TWCC is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * TWCC is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with TWCC.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @copyright Copyright (c) 2010-2014 Clément Ronzon
 * @license http://www.gnu.org/licenses/agpl.txt
 */


(function($, App) {
    "use strict";
    /*global window, jQuery, App */

    var _converterWidget, _wmm,
        _cityLocations = App.locations.capitals;

    $.fn.extend({
        // Return a stack sorted
        sort: function() {
            return this.pushStack([].sort.apply(this, arguments), []);
        },
        //Return options sorted
        sortOptions: function(sortCallback) {
            jQuery('option', this).sort(sortCallback).appendTo(this);
            return this;
        },
        // Return groups sorted
        sortGroups: function(sortCallback) {
            jQuery('optgroup', this).sort(sortCallback).appendTo(this);
            return this;
        },
        // Return the selected node with its options sorted by text (ASC)
        sortOptionsByText: function() {
            return this.sortOptions(function(x, y) {
                var xText = jQuery(x).text().toUpperCase(),
                    yText = jQuery(y).text().toUpperCase();
                return (xText < yText) ? -1 : (xText > yText) ? 1 : 0;
            });
        },
        // Return the selected node with its options sorted by text (ASC)
        sortOptgroupsByLabel: function() {
            return this.sortGroups(function(x, y) {
                var xText = jQuery(x).prop('label').toUpperCase(),
                    yText = jQuery(y).prop('label').toUpperCase();
                return (xText < yText) ? -1 : (xText > yText) ? 1 : 0;
            });
        },
        // Return the selected node with its options sorted by text (ASC)
        sortGrpsNOptionsByText: function() {
            var me = this;
            $('optgroup', this).each(function(idx) {
                $('optgroup:eq(' + idx + ')', me).sortOptionsByText();
            });
            return this.sortOptgroupsByLabel();
        },
        // Get a cross domain content through a proxy (GET method only)
        getXDomain: function(options) {
            var proxy = App.system.httpServer + '/' + App.system.dirWsIncludes + 'proxy.php',
                params = options.data ? '?' + $.param(options.data, true) : '';
            return $.ajax($.extend({
                dataType: 'script'
            }, options, {
                url: proxy,
                cache: true,
                data: {u: options.url + params}
            }));
        }
    });

    function _newDeferred(processName, timeOutMs, retryNumber) {
        var dfd = new $.Deferred(function() {
            _trigger($('body'), 'main.start', processName);
        });
        timeOutMs = timeOutMs || App.system.timeout;
        retryNumber = retryNumber || 0;
        // Reject when taking too long
        setTimeout(function timingOut() {
            if (retryNumber > 0) {
                retryNumber--;
                dfd.notify("retry");
                setTimeout(timingOut, timeOutMs);
            } else {
                dfd.reject(processName+" timed out");
            }
        }, timeOutMs);
        // Send loading message every half-second
        setTimeout(function loading() {
            if (dfd.state() === "pending") {
                dfd.notify(processName+" pending");
                setTimeout(loading, 500);
            }
        }, 1);
        _addToQueue(dfd, processName);
        return dfd;
    }

    function _addToQueue(dfd, processName) {
        $.when(dfd).then(
            function() {
                _trigger($('body'), 'main.succeeded', processName);
            },
            function() {
                _trigger($('body'), 'main.failed', processName);
            },
            function() {
                _trigger($('body'), 'main.progress', processName);
            }
        );
    }

    function _t(translationName) {
        return App.translations.hasOwnProperty(translationName) ? App.translations[translationName] : translationName;
    }

    function _trigger($anchor, eventName, data) {
        $anchor.trigger(eventName, {data: data});
    }

    function _codeAddress(geocoderService, address) {
        if (_isW3WCoordinates(address)) {
            var sourceSrsCode = 'W3wConnector',
                coordinates = _isCsvMode() ? [{x: address}] : {x: address};
            _converterWidget.pushPullSource('selection', sourceSrsCode);
            _converterWidget.pushPullSource('value', coordinates);
            _converterWidget.transform({target:'source'});
        } else {
            geocoderService.geocode({address: address, language: App.context.languageCode}, function(results, status) {
                if (status == google.maps.GeocoderStatus.OK) {
                    _transformGLatlng(results[0].geometry.location);
                } else {
                    alert(_t('geocoderFailed') + status);
                }
            });
        }
    }

    function _isW3WCoordinates(input) {
      var a = /^[a-zA-Z\u00C0-\u017F]+\.[a-zA-Z\u00C0-\u017F]+\.[a-zA-Z\u00C0-\u017F]+$/.test(input),
          b = /^\*[a-z]+$/.test(input);
      return a || b;
    }

    function _sendMsg(b, f, c) {
        var t, u;
        f = f ? f : App.system.applicationNoreply;
        u = App.system.httpServer + '/' + App.system.dirWsIncludes+'s.php';
        t = $.ajax({type:'POST', url:u, async:false, cache:false, data:'ff=g'}).responseText;
        if(t.length<10) {
            alert(_t('messageNotSent')+t);
            return false;
        } else {
            _setCookie(App.system.tokenName,t);
            $.post(u, {ff: 'd', f: f, b: b, l: App.context.languageCode}, function(code) { if(typeof(c) == 'function') c(code); });
            return true;
        }
    }

    function _setCookieParam(name, id, value, expires) {
        var cookieContent = _getCookieContent(name);
        cookieContent[id] = value;
        _setCookieContent(name, cookieContent, expires);
    }

    function _getCookieParam(name, id) {
        var cookieContent = _getCookieContent(name);
        return cookieContent[id];
    }

    function _setCookieContent(name, content, expires) {
        _setCookie(name, JSON.stringify(content), expires);
    }

    function _getCookieContent(name) {
        var cookieString = _getCookie(name);
        return cookieString ? $.parseJSON(_getCookie(name)) : {};
    }

    function _getCookie(name) {
        return $.cookie(name);
    }

    function _setCookie(name, content, expires) {
        expires = expires || 30;
        $.cookie(name, content, {expires:expires});
    }

    function _addOptionToSelect(groupLabel, srsCode, $select, definitionString) {
        var definition = proj4.defs(srsCode),
            label = definition ? definition.title || srsCode : _getTitleFromDefinitionString(definitionString, srsCode),
            optgroupSelector = 'optgroup[label="' + groupLabel + '"]';
        if (!$select.find(optgroupSelector).length) {
            $select.append($('<optgroup>', {label:groupLabel}));
        }
        $select.find(optgroupSelector).append($('<option>', {val:srsCode, text:label}));
    }

    function _getDirectUrl() {
        var wgs84 = _getWgs84(),
            url = App.system.httpServer + '/' + App.context.languageCode + '/';
        url += '?sc='+encodeURI(encodeURIComponent(_getSourceSrsCode()));
        url += '&dc='+encodeURI(encodeURIComponent(_getDestinationSrsCode()));
        url += '&wgs84='+encodeURI(encodeURIComponent(wgs84[0].x+','+wgs84[0].y));
        url += '&z='+_getZoom();
        url += '&mt='+_getMapTypeId();
        url += '#donate';
        /*url += _getMapTypeId() + '/';
        url += _getZoom() + '/';
        url += encodeURI(encodeURIComponent(_getSourceSrsCode())) + '/';
        url += encodeURI(encodeURIComponent(_getDestinationSrsCode())) + '/';
        url += wgs84[0].x + '/';
        url += wgs84[0].y + '/';*/
        return url;
    }

    function _setMapControls(map, createControl) {
        var spareCss = {
            width:'50%',
            height:_getHeaderHeightString()
        };
        map.controls[google.maps.ControlPosition.TOP_LEFT].push(createControl({
            'class': 'spare',
            css: spareCss
        }));
        map.controls[google.maps.ControlPosition.TOP_RIGHT].push(createControl({
            'class': 'spare',
            css: spareCss
        }));
        map.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(createControl({
            content: $('#license')
        }));
        map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(createControl({
            content: $('#c-container')
        }));
        map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(createControl({
            content: $('#o-container')
        }));
        map.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(createControl({
            fkidx: 2,
            content: $('#d-container')
        }));
        map.controls[google.maps.ControlPosition.RIGHT_TOP].push(createControl({
            content: $('#converter')
        }));
        if (App.context.isDevEnv) {
            var style = 'width:200px;background-color:red;margin-left:4px;padding:2px;text-align:center;',
                text = 'GOOGLE ADS',
                className = 'trsp-panel';
            map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(createControl({
                content: $('<div>', {style: style+'height:90px;', text: text, class: className+' ui-corner-bottom'})
            }));
            map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(createControl({
                content: $('<div>', {style: style+'height:200px;', text: text, class: className+' ui-corner-top'})
            }));
        }
    }

    function _setMapListeners(map, geocoderService, toggleRightClick, isRightClickEnabled) {
        var $body = $('body'),
            $map = $('#map');
        $body.on('mouseover', '#converter', function () {
            map.setOptions({scrollwheel:false});
            toggleRightClick(false);
        });
        $body.on('mouseout', '#converter', function () {
            map.setOptions({scrollwheel:true});
            toggleRightClick(true);
        });
        $('#view-map').click(function(event) {
            event.preventDefault();
            _codeAddress(geocoderService, $('#find-location').val());
        });
        $map.bind('polyline.editend', function (evt, response) {
            _transformGLatlngArray(response.data);
        });
        $map.bind('map.click', function(evt, response) {
            _transformGLatlng(response.data.latLng);
        });
        $map.bind('marker.dragend', function(evt, response) {
            _transformGLatlng(response.data);
        });
        $map.bind('map.rightclick', function (evt, response) {
            if (_isCsvMode() && isRightClickEnabled) {
                var wgs84 = _getWgs84();
                wgs84.push(_gLatlngToXy(response.data.latLng));
                _transformWgs84Array(wgs84);
            }
        });
        $map.bind('place.changed', function (evt, response) {
            var place = response.data;
            if (place.geometry) {
                _transformGLatlng(place.geometry.location);
            }
        });
    }

    function _getHeaderHeightString() {
        var height = $('#h-container').height();
        height = height > 85 ? 69 : height;
        return height +'px';
    }

    function _getTitleFromDefinitionString(definitionString, srsCode) {
        var testReg = /\+title=/ig,
            replaceReg = /.*\+title=([^\+]+).*/ig;
        return testReg.test(definitionString) ? definitionString.replace(replaceReg, '$1') : srsCode;
    }

    function _getStaticMapUrl() {
        var staticMapURL = "http://maps.googleapis.com/maps/api/staticmap?",
            wgs84 = _getWgs84();
        staticMapURL += "&zoom=" + _getZoom();
        staticMapURL += "&size=640x640";
        staticMapURL += "&visual_refresh=true";
        staticMapURL += "&maptype=" + _getMapTypeId();
        staticMapURL += "&language=" + App.context.languageCode;
        if (wgs84.length == 1) {
            staticMapURL += "&markers=" + wgs84[0].y + "," + wgs84[0].x;
        } else {
            var tmp = [];
            $.each(wgs84, function(index, value) {
                tmp.push(value.y + "," + value.x);
            });
            staticMapURL += "&path=geodesic:true|" + tmp.join("|");
        }
        staticMapURL += "&sensor=false";
        return staticMapURL;
    }

    function _openStaticMap() {
        window.open(_getStaticMapUrl(), '_blank');
    }

    function _getRandomCityLocation() {
        var idx = App.math.getRandomInteger(0, _cityLocations.length-1),
            x = _cityLocations[idx].lng,
            y = _cityLocations[idx].lat;
        return {x: x, y: y};
    }

    function _getWgs84() {
        return _converterWidget.wgs84().slice();
    }

    function _transformGLatlngArray(gLatlngArray) {
        var wgs84 = [];
        $.each(gLatlngArray, function(index, gLatlng) {
            wgs84.push(_gLatlngToXy(gLatlng));
        });
        _transformWgs84Array(wgs84);
    }

    function _transformGLatlng(gLatlng) {
        _transformWgs84Array([_gLatlngToXy(gLatlng)]);
    }

    function _transformWgs84Array(wgs84) {
        _converterWidget.transform({wgs84:wgs84});
    }

    function _gLatlngToXy(gLatlng) {
        return {x: gLatlng.lng(), y: gLatlng.lat()};
    }

    function _getSourceSrsCode() {
        return _converterWidget.pushPullSource('selection');
    }

    function _getDestinationSrsCode() {
        return _converterWidget.pushPullDestination('selection');
    }

    function _isCsvMode() {
        return _converterWidget.csv();
    }

    function _getConvergenceConvention() {
        return App.TWCCUi.getConvergenceConvention();
    }

    function _getZoom() {
        return App.map.getZoom();
    }

    function _getMapTypeId() {
        return App.map.getMapTypeId();
    }

    function _enableAutoZoom(enabled) {
        App.TWCCMap.model.setBoolean('autoZoom', enabled);
    }

    function _getWMM() {
        return _wmm;
    }

    function _degToRad(dValue) {
        var rValue;
        switch($.type(dValue)) {
            case 'object':
                rValue = {};
                $.each(dValue, function(target, value) {
                    if (value && $.type(value) !== 'number') {
                        throw 'Wrong data type';
                    }
                    rValue[target] = _degToRad(value);
                });
                break;
            case 'number':
                rValue = $.type(dValue) === 'number' ? dValue*Math.PI/180 : undefined;
                break;
        }
        return rValue;
    }

    function _radToDeg(rValue) {
        return $.type(rValue) === 'number' ? rValue*180/Math.PI : undefined;
    }

    /**
     * Add Utils
     */
    $.extend(App, {
        utils: {
            addOptionToSelect: _addOptionToSelect,
            degToRad: _degToRad,
            enableAutoZoom: _enableAutoZoom,
            getConvergenceConvention: _getConvergenceConvention,
            getCookieContent: _getCookieContent,
            getCookieParam: _getCookieParam,
            getDirectUrl: _getDirectUrl,
            getRandomCityLocation: _getRandomCityLocation,
            getTitleFromDefinitionString: _getTitleFromDefinitionString,
            getWMM: _getWMM,
            newDeferred: _newDeferred,
            openStaticMap: _openStaticMap,
            radToDeg: _radToDeg,
            sendMsg: _sendMsg,
            setCookie: _setCookie,
            setCookieContent: _setCookieContent,
            setCookieParam: _setCookieParam,
            t: _t,
            trigger: _trigger
        }
    });

    /**
     * Add Constants
     */
    $.extend(App, {
        constants: {
            keyboard: {
                RETURN: 13
            }
        }
    });

    /**
     * Add Class generator
     */
    $.extend(App, {
        Class: function(methods) {
            var klass = function() {
                this.initialize.apply(this, arguments);
            };

            for (var property in methods) {
               if (methods.hasOwnProperty(property)) {
                   klass.prototype[property] = methods[property];
               }
            }

            klass.prototype.initialize = klass.prototype.initialize || function(){};

            return klass;
        }
    });

    /**
     * Add Initializers
     */
    $.extend(App, {
        initialisers: {
            initializeMap: function() {
                var _options = $.extend(true, {}, App, App.TWCCMapOptions);
                delete _options.TWCCMapOptions; //Already passed
                App.TWCCMap = TWCCMap.getInstance(_options);
                App.map = App.TWCCMap.getMap();
                _setMapControls(App.map, App.TWCCMap.createControl);
                _setMapListeners(App.map, App.TWCCMap.getGeocoderService(), App.TWCCMap.toggleRightClick, App.TWCCMap.isRightClickEnabled);
                return App.TWCCMap.promise;
            },
            initializeUi: function() {
                var _options = $.extend(true, {}, App);
                App.TWCCUi = TWCCUi.getInstance(_options);
                return App.TWCCUi.promise;
            },
            initializeConverter: function() {
                var _options = $.extend(true, {}, App, App.TWCCConverterOptions);
                delete _options.TWCCConverterOptions; //Already passed
                App.TWCCConverter = TWCCConverter.getInstance(_options);
                _converterWidget = App.TWCCConverter.converterWidget;
                return App.TWCCConverter.promise;
            }
        }
    });

    function _init() {
        var title = '*GPS (WGS84) (deg)',
            wgs84 = {
                title: title,
                defData: '+title=' + title + ' +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees',
                isConnector: false
            };
        if ($.type(Math.sinh) !== "function") {
            Math.sinh = function(z) {
                return (Math.exp(z) - Math.exp(-z))/2;
            };
        }
        $.ajax({
            url: '/js/data/WMM.COF',
            cache: true,
            dataType: 'text'
        }).done(function (cof) {
            _wmm = geoMagFactory(cof2Obj(cof));
        }).fail(function() {
            _wmm = function() { return {}; };
        });
        $.extend(proj4.WGS84, wgs84);
        $.extend(proj4.defs('WGS84'), wgs84);
        var uiPromise = App.initialisers.initializeUi(),
            mapPromise = new $.Deferred().promise();
        uiPromise.done(function() {
            mapPromise = App.initialisers.initializeMap();
        });
        mapPromise.done(function() {
            App.initialisers.initializeConverter().done(function(data) {
                if(App.context.GET.isSetGraticule) {
                    App.TWCCMap.setGraticule();
                }
                _trigger($('body'), 'main.ready', data);
            });
        });
    }

    $(document).ready(_init);
})(jQuery, App);
