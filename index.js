////////////////////////////////////////////////////////////////////////////////
//
//     markdown-site-template 0.1
//     http://aplib.github.io/markdown-site-template/
//     (c) 2013 vadim baklanov
//     License: MIT
//
// require marked.js, controls.js, doT.js, jquery.js

// marked.js support GitHub Flavored Markdown see on https://github.com/chjj/marked/wiki
// For enable GitHub Flavored Markdown uncommented next options code lines:
//// Set default options except highlight which has no default
//marked.setOptions({
//  gfm: true,
////  highlight: function (code, lang, callback) {
////    pygmentize({ lang: lang, format: 'html' }, code, function (err, result) {
////      if (err) return callback(err);
////      callback(null, result.toString());
////    });
////  },
//  tables: true,  breaks: false,  pedantic: false,  sanitize: true,  smartLists: true,  smartypants: false,  langPrefix: 'lang-'
//});

(function()
{

    // built-in message box
    // 
    function msgbox(par, att)
    {
        controls.controlInitialize(this, 'msgbox', par, att);

        var style = 'warning';
        if (par.info) style = 'info';
        if (par.warning) style = 'warning';
        if (par.danger) style = 'danger';
        this.class('alert alert-block alert-' + style + ' fade in');
        this.style('display:inline-block;float:none;');
    };
    msgbox.prototype = controls.control_prototype;
    controls.typeRegister('msgbox', msgbox);

    
    // built-in static css effects
    
    var transforms = ',matrix,translate,translateX,translateY,scale,scaleX,scaleY,rotate,skewX,skewY,matrix3d,translate3d,translateZ,scale3d,scaleZ,rotate3d,rotateX,rotateY,rotateZ,perspective,';
    function parse_effects(_this, par, att)
    {
        var over = {};

        var transform = '';
        for(var prop in par)
        if (transforms.indexOf(prop) < 0)
            over[prop] = par[prop];
        else {
            var fname = prop, fpars = par[fname];
            if (fpars && transform)
                transform += ' ';
            if (fpars)
                transform += fname +'(' + fpars + ')';
            if (transform) {
                over.transform = transform;
            }
        }
        if (par.origin)
            over['transform-origin'] = par.origin;
        
        _this.over = over;
    }
        
    function static(par, att)
    {
        att.$text = marked(att.$text);

        controls.controlInitialize(this, 'static', par, att, static.outer_template);
        this.style('display:inline-block;');

        parse_effects(this, par, att);
        
        this.listen('element', function() {
            var element = this.element;
            if (element) {
                var $q = $(this.element);
                for(var prop in this.over)
                    $q.css(prop, this.over[prop]);
            }
        });
    };
    static.prototype = controls.control_prototype;
    controls.typeRegister('static', static);
    
    
    // hover - built-in mouse over effects
    
    function hover_mouseenter(_this) {
        var element = _this.element;
        var $q = $(element);
        var restore = _this.restore;
        var over = _this.over;
        for(var prop in over) {
            if (!restore[prop])
                restore[prop] = $q.css(prop);
            $q.css(prop, over[prop]);
        }
    }
    function hover_mouseleave(_this) {
        var $q = $(_this.element);
        var restore = _this.restore;
        for(var prop in restore) {
            var restoreval = restore[prop];
            if (restoreval !== undefined) {
                $q.css(prop, restoreval);
                restore[prop] = undefined;
            }
        }
    }
    function hover(par, att)
    {
        att.$text = marked(att.$text);

        controls.controlInitialize(this, 'hover', par, att, hover.outer_template);
        this.style('display:inline-block;');

        parse_effects(this, par, att);
        this.restore = {};
        this.listen('element', function()
        {
            var element = this._element;
            if (element)
            {
                var _this = this;
                var $q = $(element);
                $q.mouseenter(function() {
                    hover_mouseenter(_this);
                });
                $q.mouseleave(function() {
                    hover_mouseleave(_this);
                });
            }
        });
    
    };
    hover.prototype = controls.control_prototype;
    controls.typeRegister('hover', hover);
})();

var body;
window.addEventListener('load', function()
{
    // content and page structure
    body = controls.create('body'), numbers = {};
    $(document.body).contents().each(function() {
        if (this.nodeType === 8 && this.nodeValue) {
            var val = this.nodeValue, match = val.match(/^\S*/);
            if (match) {
                var name = match[0], text = ((name) ? val.substr(name.length+1) : val).trim(), frame = name || 'fill';
                if (text) {
                    var number = frame.match(/[0-9]+$/); // frame name ends with number
                    if (number) {
                        number = number[0];
                        frame = frame.substr(0, frame.length - number.length);
                    }
                    else
                        number = numbers[frame] = (numbers[frame] || -1) +1;
                    
                    // modules usage: $wiki( wiki markup text )$wiki $latex( latex markup text )$latex   (must be loaded appropriate .js module)
                    
                    var text = text.split(/(\$\S{1,999}#[\s\S]{0,999}?\([\s\S]*?\)\$\S{1,999})/g);
                    if (text.length > 1) {
                        var cframe = body.add(frame+':div', {class:frame, id:frame + (number ? number : '')});
                        var buffered_text = '';
                        for(var i = 0, c = text.length; i < c; i++) {
                            var frag = text[i];
                            if (!frag) continue;
                            if (frag[0] === '$') {
                                var parpos = frag.indexOf('('),
                                    amptag = frag.substr(0, parpos),
                                    cname = frag.substr(1, parpos - 1),
                                    numberpos = amptag.indexOf('#'),
                                    finalamptag = (numberpos >= 0) ? amptag.substr(0, numberpos) : amptag;
                                
                                if (frag.slice(-finalamptag.length - 1) === ')' + finalamptag) {
                                    var inner_text = frag.substr(amptag.length + 1, frag.length -2 -amptag.length -finalamptag.length)
                                    // lookup control
                                    try {
                                        // pass inner text to control
                                        var control = controls.create(cname, {$text: inner_text});
                                        if (control) {
                                            if (buffered_text) { // flush buffer
                                                cframe.add('p', {$text:marked(buffered_text)});
                                                buffered_text = '';
                                            }
                                            cframe.add(control);
                                        }
                                        continue;
                                    } catch (e) {  }
                                    // lookup markup parse function
                                    var markup_func = this[amptag] || window[amptag]; 
                                    if (markup_func) {
                                        if (buffered_text) { // flush buffer
                                            cframe.add('p', {$text:marked(buffered_text)});
                                            buffered_text = '';
                                        }
                                        cframe.add('p', {$text: markup_func(inner_text)});
                                        continue;
                                    }
                                }
                            }
                            buffered_text += frag;
                        }
                        if (buffered_text)
                            cframe.add('p', {$text:marked(buffered_text)});
                    }
                    else // only markdown
                        body.add(frame+':div', {class:frame, $text:marked(text[0])});
                }
            }
        }
    });

    body.attach();
    body.refresh();
    
    // patches
    
    var fixed_top_navbar = body['fixed-top-navbar'];
    var left_side_column = body['left-side-column'];
    var content = body.content;
    var right_side_column = body['right-side-column'];
    var footer = body.footer;
    var fixed_bottom_footer = body['fixed-bottom-footer'];
    
    
    if (fixed_top_navbar)
    {
        // apply styles
        fixed_top_navbar.$.addClass('navbar navbar-default navbar-fixed-top');
        fixed_top_navbar.$.find('ul').addClass('nav navbar-nav');
        // activate current page
        fixed_top_navbar.$.find('ul li a').each(function(i,e) {
            if (e.href === window.location.href) 
                $(e.parentNode).addClass('active');
        });
        // body padding
        $(document.body).css('padding-top', (parseInt('0' + document.body.style['padding-top']) + fixed_top_navbar.element.clientHeight) + 'px');
    }
    
    // columns width
    if (content && (left_side_column || right_side_column))
         $(content.element).css('width', 100 - (left_side_column ? 25 : 0) - (right_side_column ? 25 : 0) + '%');

    // body padding on fixed-bottom-footer
    if (fixed_bottom_footer)
        $(document.body).css('padding-bottom', parseInt('0' + document.body.style['padding-bottom']) + 2 * fixed_bottom_footer.element.clientHeight + 'px');
});
