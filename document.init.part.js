if (!$ENV) {

$ENV =
{
    dot: require('dot'),
    controls: require('controls'),
    marked: require('./temp/marked'),
    'bootstrap.controls': require('./temp/bootstrap.controls.js')
};

(function() { 'use strict';
    
    var extend = $ENV.controls.extend;
    
    // initialize $ENV
    
    // marked patches
    var marked = $ENV.marked;
    // Set default options except highlight which has no default
    marked.setOptions({
      gfm: true, tables: true,  breaks: false,  pedantic: false,  sanitize: false,  smartLists: true,  smartypants: false,  langPrefix: 'lang-'
    });
    $ENV.markedPostProcess = function(text, options) {
        var formatted = marked(text, options);
        return formatted;
    };
    
    // default control templates
    $ENV.default_template = function(it)
    {
        return '<div' + it.printAttributes() + '>' + $ENV.markedPostProcess( (it.attributes.$text || "") + it.controls.map(function(control) { return control.wrappedHTML(); }).join("") ) + '</div>';
    };
    $ENV.default_inline_template = function(it)
    {
        return '<span' + it.printAttributes() + '>' + $ENV.markedPostProcess( (it.attributes.$text || "") + it.controls.map(function(control) { return control.wrappedHTML(); }).join("") ) + '</span>';
    };
    $ENV.default_inner_template = function(it)
    {
        return $ENV.markedPostProcess( (it.attributes.$text || "") + it.controls.map(function(control) { return control.wrappedHTML(); }).join("") );
    };
    
    // initialize $DOC
    
    var url_params = {};
    window.location.search.substring(1).split('&').forEach(function(seg){ if (seg) {
        var pos = seg.indexOf('=');
        if (pos < 0)
            url_params[seg] = true;
        else
            url_params[seg.slice(0,pos)] = decodeURIComponent(seg.slice(pos+1).replace(/\+/g, ' '));
    }});
    
    var default_options = $DOC.options, scripts_count = 0, scripts_stated = 0;
    $DOC =
    {
        initialize: function() {
            
            this.urlParams = extend({}, url_params);
            this.options = extend({}, default_options);
            var options = this.options;
            
            // edit mode
            if (url_params.edit && window.self === window.top)
                options.edit_mode = 1; // editor
            if (url_params.preview)
                options.edit_mode = 2; // preview
            
            
            // "DOC" script element source for: root, script options

            var root = '', js_root_node = document.getElementById('DOC');
            if (js_root_node) {
                var attrs = js_root_node.attributes;
                if (attrs.hasOwnProperty('root'))
                    root = js_root_node.getAttribute('root');
                else {
                    var src = js_root_node.getAttribute('src');
                    if (src) {
                        var segs = src.split('/');
                        root = segs.slice(0, segs.length - 1).join('/');
                        if (root)
                            root += '/';
                    }
                }
            }
            this.root = root;
            
            // real executing script element source for: codebase
            
            var executing = document.currentScript;
            if (!executing) {
                var scripts = document.getElementsByTagName('script');
                for(var i = scripts.length - 1; i >= 0; i--) {
                    var script = scripts[i];
                    if (script.src.indexOf('document.') >= 0 && (!script.readyState || ' complete interactive'.indexOf(script.readyState) > 0))
                        executing = script;
                }
            }
            if (executing) {
                if (executing.src) {
                    // components is always loaded from path of the executing script
                    var origin = executing.src.split('/').slice(0, -1).join('/');
                    this.codebase = origin;
                    this.components = origin + '/components/';
                }
                options.userjs = executing.getAttribute('userjs') || options.userjs;
                options.icon = executing.getAttribute('icon') || options.icon;
                options.readonly = executing.getAttribute('readonly') || options.readonly;
            }

            // State
            this.state = 0; // 0 - started, 1 - transformation started, 2 - loaded, -1 - broken
            
            // Events
            this.events = {};
                    
            // Sections
            this.sections = {};
            
            // Sections view order
            this.order = ['fixed-top-bar', 'fixed-top-panel',
                'header-bar', 'header-panel',
                'left-side-bar', 'left-side-panel',
                'content-bar', 'content-panel',
                'right-side-panel', 'right-side-bar',
                'footer-panel', 'footer-bar',
                'fixed-bottom-panel', 'fixed-bottom-bar'];
            
            this.columns = ['left-side-bar', 'left-side-panel', 'content-bar', 'content-panel', 'right-side-panel', 'right-side-bar'];
            
            // Texts and templates
            this.vars = {};
            
            this.filters = [];
            
            this.mods = {};
            
            // clear controls tree
            if (this.chead)
                this.chead.detachAll();
            this.chead = controls.create('head');
            this.chead.attach();
            
            if (this.cbody)
                this.cbody.detachAll();
            this.cbody = controls.create('body');
        },
        
        forceEvent: function(name) {
            var events = this.events;
            if (!events.hasOwnProperty(name))
                events[name] = new controls.Event();
            return events[name];
        },
        // on DOMContentLoaded or simulated if DOMContentLoaded is already raised
        onready: function(handler) {
            if (this.state === 2 || document.readyState === undefined || ' interactive complete'.indexOf(document.readyState) > 0)
                handler();
            else
                window.addEventListener('DOMContentLoaded', handler);
        },
        // Document transformation completed event
        onload: function(handler) { if (this.state === 2) handler(); else this.forceEvent('load').addListener(handler); },
        // Section control created event
        onsection: function(handler) { this.forceEvent('section').addListener(handler); },
                
        addSection: function(name, value) {
            var sections = this.sections, exists = sections[name];
            if (exists) {
                if (exists._element)
                    exists.deleteElement();
            }
            sections[name] = value;
        },
        removeSection: function(name) {
            var sections = this.sections, exists = sections[name];
            if (exists) {
                if (exists._element)
                    exists.deleteElement();
                sections[name] = undefined;
            }
        },
        // move section to placeholder location
        sectionPlaceholder: function(name, text_node) {
            var sections = this.sections, exists = sections[name];
            // move exists node
            if (exists) {
                if (exists.__type) {
                    var element = exists.element;
                    if (element)
                        document.insertBefore(element, text_node);
                } else if (exists.nodeType) {
                    document.insertBefore(exists, text_node);
                }
            }
            sections[name] = {placeholder:text_node, content:exists};
        },
        // move section to other location
        sectionMover: function(text_node, oldname, newname) {
            var sections = this.sections, exists = sections[oldname];
            if (typeof exists === 'string') {
                sections[newname] = exists;
                delete sections[oldname];
            } else if (exists) {
                if (exists.__type) {
                    exists.class(newname, oldname);
                    var element = exists.element;
                    if (element)
                        document.insertBefore(element, text_node);
                } else if (exists.nodeType) {
                    document.insertBefore(exists, text_node);
                }
            }
        },
        // parse sections values from text or from function text
        parseContent: function(content) {
            if (content) {
                var frags = content.toString().split(/(<!--\S+\s+)|(-->)/gm);
                for(var i = 0, c = frags.length; i < c; i+=1) {
                    var test = frags[i];
                    if (test && test.substr(0,4) === '<!--') {
                        // first '$' - var else section
                        if (test[4] === '$') {
                            // as var
                            var varname = test.substr(4).trim();
                            this.vars[varname] = frags[i+2];
                        } else {
                            // as section
                            var section = test.substr(4).trim();
                            this.addSection(section, frags[i+2]);
                        }
                        i += 2;
                    }
                }
            }
        },
        
        // append to head
        appendElement: function(id, tag, attributes) {
            try {
                if (arguments.length < 3) { attributes = tag; tag = id; id = undefined; }
                var head = document.head;
                if (id) {
                    var element = document.getElementById(id);
                    if (element && element.parentNode === head)
                        return;
                }
                head.insertAdjacentHTML('beforeend',
                    '<' + tag + (id ? (' id="'+id+'"') : '') + Object.keys(attributes).map(function(prop){return' '+prop+'="'+attributes[prop]+'"';}).join('') + '></' + tag + '>');
                return head.lastChild;
            } catch(e) { console.log(e); }
        },
        // remove from head
        removeElement: function(id) {
            var element = document.getElementById(id);
            if (element && element.parentNode === document.head)
                document.head.removeChild(element);
        },
        
        appendScript: function(id, src, callback) {
            if (arguments.length === 1 || typeof src === 'function') { callback = src; src = id; id = undefined; }
            if (id && document.getElementById(id)) {
                // script already loaded
                if (callback)
                    callback(+1);
                return;
            }
            scripts_count++;
            var script = document.createElement('script');
            if (id)
                script.id = id;
            script.src = src;
            script.async = true;
            script.addEventListener('load', function() {
                if (callback)
                    callback(+1);
                scripts_stated++;
                $DOC.checkAllScriptsReady();
            });
            script.addEventListener('error', function() {
                if (callback)
                    callback(-1);
                scripts_stated++;
                $DOC.checkAllScriptsReady();
            });
            document.head.appendChild(script);
        },
        // load user.js scripts
        loadUserJS: function() {
            var userjs = this.options.userjs;
            if (userjs) {
                userjs = userjs.split(',');
                for(var i = 0, c = userjs.length; i < c; i++)
                    this.appendScript('user.js/' + i, this.root + userjs[i]);
            }
        },
        // document transformation start after all scripts loaded or failed
        checkAllScriptsReady: function() {
            if (scripts_count === scripts_stated && !$DOC.state && $DOC.finalTransformation)
                $DOC.finalTransformation();
        },
        
        appendCSS: function(id, css, callback, position) {
            var head = document.head, exists = document.getElementById(id),
                israwcss = (css.indexOf('{') >= 0);
            if (!exists) {
                if (israwcss) {
                    head.insertAdjacentHTML(position || 'beforeend', '<style id="' + id + '" auto="true">' + css + '</style>');
                } else {
                    var link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.type = 'text/css';
                    link.id = id;
                    link.auto = true;
                    link.href = css;
                    if (callback) {
                        link.addEventListener('load', function() { callback(1); });
                        link.addEventListener('error', function() { callback(-1); });
                    }
                    switch(position) {
                        case 'afterbegin':
                            if (head.firstChild)
                                head.insertBefore(link, head.firstChild);
                            else
                                head.appendChild(link);
                        break;
                        default:
                            head.appendChild(link);
                    }
                }
            } else if (israwcss) {
                if (exists.innerHTML !== css)
                    exists.innerHTML = css;
            } else if (exists.href !== css)
                exists.href = css;
        },
        
        mod: function(group, names) {
            if (arguments.length === 1)
                names = group;
            var mod_group = $DOC.mods[group];
            if (!mod_group) {
                mod_group = [];
                $DOC.mods[group] = mod_group;
            }
            names.split(/ ,;/g).forEach(function(name) {
                if (mod_group.indexOf(name) < 0) {
                    var path = $DOC.root + 'mods/' + name + '/' + name;
                    $DOC.appendCSS(group + '-' + name + '-css', path + '.css');
                    $DOC.appendScript(group + '-' + name + '-js', path + '.js');
                    mod_group.push(name);
                }
            });
        },
        removeMod: function(group, names) {
            var mod_group = $DOC.mods[group];
            if (mod_group) {
                ((arguments.length === 1) ? mod_group : names.split(/ ,;/g)) .forEach(function(name) {
                    var index = mod_group.indexOf(name);
                    if (index >= 0) {
                        $DOC.removeElement(group + '-' + name + '-css');
                        $DOC.removeElement(group + '-' + name + '-js');
                        mod_group.splice(index, 1);
                    }
                });
            }
        }
    };
    $DOC.initialize();
    

    // selected theme
    var theme = '', theme_confirmed;
    if (typeof localStorage !== 'undefined') {
        
        theme = localStorage.getItem('primary-theme');
        theme_confirmed = localStorage.getItem('primary-theme-confirmed');
        
        // apply theme 'theme=' command
        var params_theme = url_params.theme;
        if (params_theme && params_theme !== theme) {
            theme = params_theme;
            theme_confirmed = '';
        }
        
        // switch theme 'settheme=' command
        var params_settheme = url_params.settheme;
        if (params_settheme) {
            if (params_settheme !== theme) {
                theme_confirmed = '';
                localStorage.setItem('primary-theme-confirmed', '');
            }
            localStorage.setItem('primary-theme', params_settheme);
            theme = params_settheme;
        }
    }
    
    Object.defineProperty($DOC, 'theme', {
        get: function() { return theme; },
        set: function(value) {
            value = value || '';
            if (value !== theme && typeof localStorage !== 'undefined') {
                if (value)
                    localStorage.setItem('primary-theme', value); 
                else {
                    localStorage.removeItem('primary-theme');
                    localStorage.removeItem('primary-theme-confirmed');
                }
                window.location.reload();
            }
        }
    });
    
    // >> head transformation
    
    $DOC.headTransformation = function() {
    
        $DOC.appendElement('meta', {name:'viewport', content:'width=device-width, initial-scale=1.0'});
        if ($DOC.options.icon)
            $DOC.appendElement('link', {rel:'shortcut icon', href:$DOC.options.icon.replace('{{=$DOC.root}}', $DOC.root)});

        // document style

        $DOC.appendCSS('document.css',
'.fixed-top-bar, .fixed-top-panel\
    { display: block; margin: 0; padding: 0; position: fixed; top: 0; left: 0; right: 0; z-index: 1030; }\
.fixed-top-panel\
    { background-color: inherit; padding: 25px 37px 0px 37px; margin-bottom: 25px; }\
.fixed-top-panel > .navbar\
    { margin: 0; }\
.header-bar, .header-panel\
    { display: block; margin: 0; padding: 0; }\
.header-panel\
    { padding: 25px 37px; }\
.footer-bar, .footer-panel\
    { display: block; margin: 0; padding: 0; }\
.footer-panel\
    { padding: 25px 37px; }\
.fixed-bottom-bar, .fixed-bottom-panel\
    { display: block; margin: 0; padding: 0; position: fixed; bottom: 0; left: 0; right: 0; z-index: 1030; }\
.fixed-bottom-panel\
    { padding: 0px 37px 0px 37px; margin-top: 25px; }\
.fixed-bottom-panel > .navbar\
    { margin: 0; }\
.text-box\
    { width:50%; padding:25px 37px 25px 37px; display: inline-block; }\
.fixed-left-side-bar, .fixed-left-side-panel\
    { display: table-cell; margin: 0; padding: 0; vertical-align: top; width: auto; position: fixed; top: 0; right: 0; bottom: 0; z-index: 1030; }\
.fixed-left-side-panel\n\
    { width: auto; padding:25px 20px; }\
.left-side-bar, .left-side-panel\
    { display: table-cell; margin: 0; padding: 0; vertical-align: top; width: 26%; min-width: 240px; }\
.left-side-panel\
    { padding:25px 9px 25px 37px; }\
.content-bar, .content-panel\
    { display: table-cell; margin: 0; padding: 0; vertical-align: top; width: 60%; min-width: 250px; max-width: 73%; }\
.content-panel\
    { padding:25px 37px 25px 37px; }\
.fixed-right-side-bar, .fixed-right-side-panel\
    { display: table-cell; margin: 0; padding: 0; vertical-align: top; width: auto; position: fixed; top: 0; right: 0; bottom: 0; z-index: 1030;}\
.fixed-right-side-panel\
    { width: auto; padding:25px 20px;}\
.right-side-bar, .right-side-panel\
    { display: table-cell; margin: 0; padding: 0; vertical-align: top; min-width: 240px; width: 28%;}\
.right-side-panel\
    { padding:25px 25px 25px 9px;}\
\
@media (max-width: 1024px) {\
.right-side-bar, .right-side-panel\
    { display: block; padding:25px 25px 25px 37px; width: 50%; }\
.right-side-panel\
    { padding:25px 25px 25px 37px; }\
}\
\
@media (max-width: 768px) {\
.left-side-bar, .left-side-panel\
    { display: block; margin: 0; padding: 0; width: auto; }\
.left-side-panel\
    { padding:25px 25px 25px 25px; }\
.content-bar, .content-panel\
    { display: block; margin: 0; padding: 0; max-width: 100%; width: auto; }\
.content-panel\
    { padding:25px 25px 25px 25px; }\
.right-side-bar, .right-side-panel\
    { display: block; margin: 0; padding: 0; width: auto; }\
.right-side-panel\
    { padding:25px 25px 25px 25px; }\
}\
.table-bordered {display:table-cell;}\
.stub {display:inline-block;}\
.stub-error {width:18px; height:18px; border:silver dotted 1px; border-radius:2px;}\
.stub-error:before {content:"?"; font-size:small; color:silver; margin:4px; position:relative; top:-2px;}\
\
.tabpanel-body {padding-bottom:5px; border-left:#DDD solid 1px; border-right:#DDD solid 1px; border-bottom:#DDD solid 1px;}\
.nav-tabs > li > a:focus {outline-color:silver;}\
\
.transparent {background-color:transparent;border-color:transparent;} .transparent:hover {text-decoration:none;}\
.rel {position:relative;} .abs {position:absolute;}\
.hidden {display:none;} .block {display:block;} .inline {display:inline;} .inlineblock {display:inline-block;} .tabcell {display:table-cell;} .tabcol {display:table-column;} .tabrow {display:table-row;}\
.bold {font-weight:bold;} .justify {text-align:justify;} .nowrap {white-space:nowrap;} .l {font-size:90%;} .ll {font-size:80%;}\
.fleft {float:left;} .fright {float:right;} .fnone {float:none;}\
.left {text-align:left;} .right {text-align:right;} .clear {clear:both;} .clearleft {clear:left;} .clearright {clear:right;}\
.center {text-align:center;vertical-align:middle;} .hcenter {text-align:center;} .vcenter {vertical-align:middle;} .bottom {vertical-align:bottom;}\
.mar0 {margin:0;} .martop0 {margin-top:0;}\
.mar5 {margin:5px;} .martop5 {margin-top:5px;} .marbottom5 {margin-top:5px;}\
.mar10 {margin:10px;} .martop10 {margin-top:10px;} .marbottom10 {margin-bottom:10px;} .marright10 {margin-bottom:10px;}\
.mar15 {margin:15px;} .martop15 {margin-top:15px;} .marbottom15 {margin-bottom:15px;}\
.mar20 {margin:20px;} .martop20 {margin-top:20px;} .marbottom20 {margin-bottom:20px;} .marleft20 {margin-left:20px;}\
.pad0 {padding:0;} .padtop0 {padding-top:0;}\
.pad5 {padding:5px;} .pad10 {padding:10px;} .pad15 {padding:15px;} .pad20 {padding:20px;}\
.padtop15 {padding-top:15px;} .padtop20 {padding-top:20px;}\
.padleft10 {padding-left:10px;} .padleft15 {padding-left:15px;} .padleft20 {padding-left:20px;}\
.padright5 {padding-right:5px;} .padright20 {padding-right:20px;}\
');
        var edit_mode = $DOC.options.edit_mode;
        
        if (theme && edit_mode !== 1) {
            // theme loading and confirmed flag
            $DOC.appendCSS('theme.css', $DOC.root + 'mods/' + theme + '/' + theme + '.css', function(state) {
                if (state < 0 && theme_confirmed)
                    localStorage.setItem('primary-theme-confirmed', '');
                else if (state > 0 && !theme_confirmed)
                    localStorage.setItem('primary-theme-confirmed', true);
            }, 'afterbegin');
            $DOC.appendScript('theme.js', $DOC.root + 'mods/' + theme + '/' + theme + '.js');
        }
        // load bootstrap.css if not theme or previous load error
        if (!theme || !theme_confirmed || edit_mode === 1) {
            var bcss = document.getElementById('bootstrap.css');
            if (!bcss) {
                // check boostrap.css load
                var links = document.getElementsByTagName('link');
                for(var i = links.length - 1; i >= 0; i--) {
                    var href = links[i].href;
                    if (href.indexOf('bootstrap.css') >= 0 || href.indexOf('bootstrap.min.css') >= 0) {
                        bcss = true;
                        break;
                    }
                }
                if (!bcss) {
                    var bootstrapcss_cdn = (window.location.protocol === 'file:' ? 'http:' : '') + '//netdna.bootstrapcdn.com/bootstrap/3.0.0/css/bootstrap.min.css';
                    $DOC.appendCSS('bootstrap.css', ($DOC.codebase.indexOf('aplib.github.io') >= 0) ? bootstrapcss_cdn : ($DOC.codebase + '/bootstrap.css'), function(state) {
                        if (state < 0)  $DOC.appendCSS('bootstrap.css', bootstrapcss_cdn, null, 'afterbegin'); // load from CDN
                    }, 'afterbegin');
                }
            }
        }
        
        // open editor
        if (!$DOC.options.readonly) {
            if (edit_mode === 1)
                openEditor();
            if (window.top === window.self)
            window.addEventListener('keydown', function(event) {
                if (event.keyCode === 123 && !event.altKey && event.ctrlKey) {
                    if (edit_mode) {
                        var url = location.href, pos = url.lastIndexOf('edit');
                        if (url.slice(-5) === '?edit')
                            window.location = url.slice(0, url.length-5);
                        else if (pos > 0)
                            window.location = url.slice(0, pos) + url.slice(pos + 4);
                    } else
                        window.location = (window.location.protocol || '') + '//' + window.location.host + window.location.pathname + '?' + window.location.search + ((window.location.search) ? '&edit' : 'edit');
                }
            });
        }
        function openEditor() {
            $DOC.appendScript('editor.js', $DOC.root + 'editor.js', function(state) {
                if (state < 0) $DOC.appendScript('aplib.github.io/editor.js', 'http://aplib.github.io/editor.min.js');
            });
        }
    };
    $DOC.headTransformation();
    
}).call(this);
}