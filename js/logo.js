(function () {
    'use strict';

    var W = 800, H = 800;

    // ---------- Pomocné ----------
    function norm(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

    function LogoError(msg, line) {
        var e = new Error(msg);
        e.line = line;
        e.logo = true;
        return e;
    }

    function fmt(v) {
        if (typeof v === 'number') { return String(Math.round(v * 1e6) / 1e6); }
        if (Array.isArray(v)) { return v.map(fmt).join(' '); }
        return String(v);
    }

    // ---------- Názvy příkazů ----------
    var ALIAS = {
        FORWARD: 'FD', VPRED: 'FD', DOPREDU: 'FD',
        BACK: 'BK', VZAD: 'BK',
        LEFT: 'LT', VLEVO: 'LT',
        RIGHT: 'RT', VPRAVO: 'RT',
        PENUP: 'PU', NAHORU: 'PU',
        PENDOWN: 'PD', DOLU: 'PD',
        CLEARSCREEN: 'CS', SMAZ: 'CS',
        DOMU: 'HOME',
        SETHEADING: 'SETH', NASTAVSMER: 'SETH',
        SETCOLOR: 'SETPC', SETPENCOLOR: 'SETPC', BARVA: 'SETPC',
        SETBACKGROUND: 'SETBG', POZADI: 'SETBG',
        SETPENSIZE: 'SETPS', TLOUSTKA: 'SETPS',
        HIDETURTLE: 'HT', SKRYJ: 'HT',
        SHOWTURTLE: 'ST', UKAZ: 'ST',
        OPAKUJ: 'REPEAT', KDYZ: 'IF', KDYZJINAK: 'IFELSE',
        UDELEJ: 'MAKE', PIS: 'PRINT', POPIS: 'LABEL',
        ZASTAV: 'STOP', OP: 'OUTPUT', VRAT: 'OUTPUT'
    };

    // druhy argumentů: n výraz, b blok, q „slovo, c barva
    var CMDS = {
        FD: ['n'], BK: ['n'], LT: ['n'], RT: ['n'],
        PU: [], PD: [], CS: [], CLEAN: [], HOME: [],
        SETXY: ['n', 'n'], SETX: ['n'], SETY: ['n'], SETH: ['n'],
        SETPC: ['c'], SETBG: ['c'], SETPS: ['n'],
        HT: [], ST: [],
        REPEAT: ['n', 'b'], IF: ['n', 'b'], IFELSE: ['n', 'b', 'b'],
        MAKE: ['q', 'n'], PRINT: ['n'], LABEL: ['n'],
        STOP: [], OUTPUT: ['n']
    };

    var FALIAS = {
        NAHODA: 'RANDOM', ODMOCNINA: 'SQRT', ZBYTEK: 'REMAINDER', MOCNINA: 'POWER',
        SMER: 'HEADING', NE: 'NOT', A: 'AND', NEBO: 'OR'
    };
    var FUNCS = {
        RANDOM: 1, SQRT: 1, SIN: 1, COS: 1, ARCTAN: 1, ABS: 1, INT: 1, NOT: 1,
        REMAINDER: 2, POWER: 2, MIN: 2, MAX: 2, AND: 2, OR: 2,
        XCOR: 0, YCOR: 0, HEADING: 0, PI: 0
    };

    var PALETTE = ['#000000', '#2d4dff', '#1fbf3a', '#00e5e5', '#ff2d2d', '#ff2dff', '#ffe600', '#ffffff',
        '#8b4513', '#d2b48c', '#228b22', '#7fffd4', '#fa8072', '#a020c0', '#ffa500', '#808080'];
    var COLOR_NAMES = {
        BLACK: 0, BLUE: 1, GREEN: 2, CYAN: 3, RED: 4, MAGENTA: 5, YELLOW: 6, WHITE: 7, BROWN: 8, TAN: 9,
        FOREST: 10, AQUA: 11, SALMON: 12, PURPLE: 13, ORANGE: 14, GRAY: 15, GREY: 15,
        CERNA: 0, MODRA: 1, ZELENA: 2, AZUROVA: 3, TYRKYSOVA: 3, CERVENA: 4, FIALOVA: 13,
        ZLUTA: 6, BILA: 7, HNEDA: 8, ORANZOVA: 14, SEDA: 15
    };
    var EXTRA_COLORS = { PINK: '#ff9ecb', RUZOVA: '#ff9ecb' };

    // ---------- Tokenizer ----------
    function tokenize(src) {
        var toks = [];
        src.split('\n').forEach(function (line, li) {
            var clean = line.replace(/;.*$/, '');
            var re = /\[|\]|\(|\)|<=|>=|<>|[+\-*\/<>=%]|:?[\p{L}\p{N}_.?]+|"[\p{L}\p{N}_.?]*/gu;
            var m, last = 0;
            while ((m = re.exec(clean)) !== null) {
                if (/\S/.test(clean.slice(last, m.index))) {
                    throw LogoError('Neznámý znak „' + clean.slice(last, m.index).trim().charAt(0) + '“', li + 1);
                }
                last = m.index + m[0].length;
                var s = m[0], end = last;
                var spB = m.index === 0 || /\s/.test(clean.charAt(m.index - 1));
                var spA = end >= clean.length || /\s/.test(clean.charAt(end));
                var prev = toks[toks.length - 1];
                var t = { line: li + 1 };
                if (s === '[' || s === ']' || s === '(' || s === ')') {
                    t.k = s;
                } else if (s === '-') {
                    var unary = !prev || prev.k === 'op' || prev.k === 'neg' || prev.k === '[' || prev.k === '(' ||
                        (spB && !spA);
                    if (unary) { t.k = 'neg'; } else { t.k = 'op'; t.v = '-'; }
                } else if (/^[+*\/<>=%]|^<=|^>=|^<>/.test(s) && !/^[\p{L}\p{N}]/u.test(s)) {
                    t.k = 'op'; t.v = s;
                } else if (s.charAt(0) === ':') {
                    t.k = 'var'; t.v = norm(s.slice(1));
                } else if (s.charAt(0) === '"') {
                    t.k = 'str'; t.v = s.slice(1); t.n = norm(s.slice(1));
                } else if (/^\d+(\.\d+)?$/.test(s)) {
                    t.k = 'num'; t.v = parseFloat(s);
                } else {
                    t.k = 'word'; t.v = norm(s); t.r = s;
                }
                toks.push(t);
            }
            if (/\S/.test(clean.slice(last))) {
                throw LogoError('Neznámý znak „' + clean.slice(last).trim().charAt(0) + '“', li + 1);
            }
        });
        return toks;
    }

    // ---------- Parser ----------
    var CMP = { '<': 1, '>': 1, '=': 1, '<=': 1, '>=': 1, '<>': 1 };

    function isBuiltinName(n) {
        return !!(CMDS[ALIAS[n] || n] || ALIAS[n] || FUNCS[FALIAS[n] || n] !== undefined || FALIAS[n] ||
            n === 'TO' || n === 'END' || n === 'PRIKAZ' || n === 'KONEC' || n === 'CLEAN');
    }

    function parseProgram(src, known) {
        var toks = tokenize(src);
        var arity = {};
        var procs = {};
        if (known) {
            Object.keys(known).forEach(function (k) { arity[k] = known[k].params.length; });
        }

        // 1. oddělit definice příkazů od hlavního programu
        var main = [], defs = [], i;
        for (i = 0; i < toks.length; i++) {
            var t = toks[i];
            if (t.k === 'word' && (t.v === 'TO' || t.v === 'PRIKAZ')) {
                var nameTok = toks[i + 1];
                if (!nameTok || nameTok.k !== 'word') { throw LogoError('Za ' + t.r + ' musí následovat jméno příkazu', t.line); }
                if (isBuiltinName(nameTok.v)) { throw LogoError('Jméno ' + nameTok.r + ' je vyhrazené', nameTok.line); }
                if (arity[nameTok.v] !== undefined && (!known || !known[nameTok.v])) {
                    throw LogoError('Příkaz ' + nameTok.r + ' už je definován', nameTok.line);
                }
                var j = i + 2, params = [];
                while (toks[j] && toks[j].k === 'var') { params.push(toks[j].v); j++; }
                var e = j;
                while (e < toks.length && !(toks[e].k === 'word' && (toks[e].v === 'END' || toks[e].v === 'KONEC'))) { e++; }
                if (e >= toks.length) { throw LogoError('Příkaz ' + nameTok.r + ' nemá konec (END / KONEC)', t.line); }
                arity[nameTok.v] = params.length;
                defs.push({ name: nameTok.v, params: params, body: toks.slice(j, e) });
                i = e;
            } else {
                main.push(t);
            }
        }

        function Parser(tokens) {
            var p = 0;

            function peek() { return tokens[p]; }
            function last() { return tokens.length ? tokens[tokens.length - 1].line : 1; }
            function lineNow() { return tokens[p] ? tokens[p].line : last(); }

            this.seq = function () {
                var list = [];
                while (p < tokens.length) { list.push(stmt()); }
                return list;
            };

            function bracketTokens() {
                var t = tokens[p];
                if (!t || t.k !== '[') { throw LogoError('Očekávám [ ... ]', lineNow()); }
                var depth = 0, start = p + 1;
                for (; p < tokens.length; p++) {
                    if (tokens[p].k === '[') { depth++; }
                    else if (tokens[p].k === ']') {
                        depth--;
                        if (depth === 0) { var sub = tokens.slice(start, p); p++; return sub; }
                    }
                }
                throw LogoError('Chybí ] – hranatá závorka není uzavřena', t.line);
            }

            function block() { return new Parser(bracketTokens()).seq(); }

            function dataItem(sub, idx) {
                var t = sub[idx.i++];
                if (t.k === 'num') { return { type: 'num', v: t.v }; }
                if (t.k === 'neg') {
                    var n = sub[idx.i++];
                    if (!n || n.k !== 'num') { throw LogoError('Za mínusem v seznamu musí být číslo', t.line); }
                    return { type: 'num', v: -n.v };
                }
                if (t.k === 'var') { return { type: 'var', name: t.v, line: t.line }; }
                if (t.k === 'str') { return { type: 'str', v: t.v }; }
                if (t.k === 'word') { return { type: 'str', v: t.r }; }
                if (t.k === '[') {
                    idx.i--;
                    // vnořený seznam
                    var depth = 0, s = idx.i;
                    for (; idx.i < sub.length; idx.i++) {
                        if (sub[idx.i].k === '[') { depth++; }
                        else if (sub[idx.i].k === ']') { depth--; if (depth === 0) { break; } }
                    }
                    var inner = sub.slice(s + 1, idx.i);
                    idx.i++;
                    return { type: 'list', items: dataList(inner) };
                }
                throw LogoError('Neplatná položka seznamu', t.line);
            }

            function dataList(sub) {
                var items = [], idx = { i: 0 };
                while (idx.i < sub.length) { items.push(dataItem(sub, idx)); }
                return items;
            }

            function expr() { return cmp(); }

            function cmp() {
                var l = add();
                while (peek() && peek().k === 'op' && CMP[peek().v]) {
                    var o = tokens[p++];
                    l = { type: 'bin', op: o.v, l: l, r: add(), line: o.line };
                }
                return l;
            }

            function add() {
                var l = mul();
                while (peek() && peek().k === 'op' && (peek().v === '+' || peek().v === '-')) {
                    var o = tokens[p++];
                    l = { type: 'bin', op: o.v, l: l, r: mul(), line: o.line };
                }
                return l;
            }

            function mul() {
                var l = unary();
                while (peek() && peek().k === 'op' && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
                    var o = tokens[p++];
                    l = { type: 'bin', op: o.v, l: l, r: unary(), line: o.line };
                }
                return l;
            }

            function unary() {
                var t = peek();
                if (t && t.k === 'neg') { p++; return { type: 'neg', e: unary(), line: t.line }; }
                return primary();
            }

            function primary() {
                var t = tokens[p++];
                if (!t) { throw LogoError('Chybí hodnota (výraz skončil předčasně)', last()); }
                switch (t.k) {
                    case 'num': return { type: 'num', v: t.v };
                    case 'var': return { type: 'var', name: t.v, line: t.line };
                    case 'str': return { type: 'str', v: t.v };
                    case '[':
                        p--;
                        return { type: 'list', items: dataList(bracketTokens()) };
                    case '(':
                        var e = expr();
                        if (!peek() || peek().k !== ')') { throw LogoError('Chybí )', t.line); }
                        p++;
                        return e;
                    case 'word':
                        return wordExpr(t);
                }
                throw LogoError('Neočekávané „' + (t.v !== undefined ? t.v : t.k) + '“', t.line);
            }

            function wordExpr(t) {
                var n = t.v;
                if (n === 'TRUE' || n === 'PRAVDA') { return { type: 'num', v: 1 }; }
                if (n === 'FALSE' || n === 'NEPRAVDA') { return { type: 'num', v: 0 }; }
                if (arity[n] !== undefined) {
                    var args = [];
                    for (var i = 0; i < arity[n]; i++) { args.push(expr()); }
                    return { type: 'ucall', name: n, args: args, line: t.line };
                }
                var f = FALIAS[n] || n;
                if (FUNCS[f] !== undefined) {
                    var fa = [];
                    for (var k = 0; k < FUNCS[f]; k++) { fa.push(expr()); }
                    return { type: 'fn', name: f, args: fa, line: t.line };
                }
                if (CMDS[ALIAS[n] || n]) {
                    throw LogoError('„' + t.r + '“ nevrací hodnotu – nelze ho použít ve výrazu', t.line);
                }
                throw LogoError('Neznám slovo „' + t.r + '“', t.line);
            }

            function colorArg() {
                var t = peek();
                if (t && t.k === 'word' && (COLOR_NAMES[t.v] !== undefined || EXTRA_COLORS[t.v])) {
                    p++;
                    return { type: 'str', v: t.v };
                }
                return expr();
            }

            function stmt() {
                var t = tokens[p++];
                if (t.k !== 'word') {
                    throw LogoError('Nevím, co mám dělat s „' + (t.k === 'num' ? t.v : (t.v !== undefined ? t.v : t.k)) + '“', t.line);
                }
                var n = t.v;
                if (arity[n] !== undefined) {
                    var ua = [];
                    for (var i = 0; i < arity[n]; i++) {
                        if (p >= tokens.length) { throw LogoError('Příkaz ' + t.r + ' potřebuje ' + arity[n] + ' parametr(ů)', t.line); }
                        ua.push(expr());
                    }
                    return { type: 'call', name: n, args: ua, line: t.line };
                }
                var c = ALIAS[n] || n;
                var spec = CMDS[c];
                if (!spec) {
                    if (n === 'END' || n === 'KONEC') { throw LogoError('Nečekané ' + t.r + ' bez TO / PRIKAZ', t.line); }
                    throw LogoError('Neznámý příkaz „' + t.r + '“', t.line);
                }
                var a = [];
                spec.forEach(function (kind) {
                    if (p >= tokens.length && kind !== 'b') {
                        throw LogoError('Příkaz ' + t.r + ' potřebuje další hodnotu', t.line);
                    }
                    if (kind === 'n') { a.push(expr()); }
                    else if (kind === 'b') { a.push(block()); }
                    else if (kind === 'c') { a.push(colorArg()); }
                    else if (kind === 'q') {
                        var q = tokens[p++];
                        if (!q || q.k !== 'str') { throw LogoError('Za ' + t.r + ' musí následovat jméno proměnné v uvozovkách, např. "x', t.line); }
                        a.push(q.n);
                    }
                });
                return { type: c, args: a, line: t.line };
            }
        }

        var mainAst = new Parser(main).seq();
        defs.forEach(function (d) {
            procs[d.name] = { params: d.params, body: new Parser(d.body).seq() };
        });
        return { main: mainAst, procs: procs };
    }

    // ---------- Interpret ----------
    function StopSig() { }
    function OutSig(v) { this.value = v; }

    var MAX_DEPTH = 600;

    function lookup(env, name, line) {
        for (var i = env.scopes.length - 1; i >= 0; i--) {
            if (Object.prototype.hasOwnProperty.call(env.scopes[i], name)) { return env.scopes[i][name]; }
        }
        throw LogoError('Proměnná :' + name + ' nemá hodnotu', line);
    }

    function setVar(env, name, v) {
        for (var i = env.scopes.length - 1; i >= 0; i--) {
            if (Object.prototype.hasOwnProperty.call(env.scopes[i], name)) { env.scopes[i][name] = v; return; }
        }
        env.scopes[0][name] = v;
    }

    function num(v, line, what) {
        if (typeof v !== 'number' || isNaN(v)) { throw LogoError((what || 'Operace') + ' potřebuje číslo, ne „' + fmt(v) + '“', line); }
        return v;
    }

    function ev(n, env) {
        switch (n.type) {
            case 'num': return n.v;
            case 'str': return n.v;
            case 'var': return lookup(env, n.name, n.line);
            case 'list': return n.items.map(function (i) { return ev(i, env); });
            case 'neg': return -num(ev(n.e, env), n.line, 'Mínus');
            case 'bin': return binop(n, env);
            case 'fn': return fn(n, env);
            case 'ucall': return callSync(n, env);
        }
        throw LogoError('Interní chyba výrazu', n.line);
    }

    function binop(n, env) {
        var l = ev(n.l, env), r = ev(n.r, env);
        switch (n.op) {
            case '=':
                if (typeof l === 'string' || typeof r === 'string') { return String(l).toUpperCase() === String(r).toUpperCase() ? 1 : 0; }
                return l === r ? 1 : 0;
            case '<>':
                if (typeof l === 'string' || typeof r === 'string') { return String(l).toUpperCase() !== String(r).toUpperCase() ? 1 : 0; }
                return l !== r ? 1 : 0;
        }
        var a = num(l, n.line, 'Operátor ' + n.op), b = num(r, n.line, 'Operátor ' + n.op);
        switch (n.op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/':
                if (b === 0) { throw LogoError('Dělení nulou', n.line); }
                return a / b;
            case '%':
                if (b === 0) { throw LogoError('Dělení nulou', n.line); }
                return a % b;
            case '<': return a < b ? 1 : 0;
            case '>': return a > b ? 1 : 0;
            case '<=': return a <= b ? 1 : 0;
            case '>=': return a >= b ? 1 : 0;
        }
        return 0;
    }

    function fn(n, env) {
        var a = n.args.map(function (x) { return ev(x, env); });
        var name = n.name, t = env.t;
        function N(i) { return num(a[i], n.line, name); }
        switch (name) {
            case 'RANDOM': return Math.floor(Math.random() * Math.max(0, Math.floor(N(0))));
            case 'SQRT':
                if (N(0) < 0) { throw LogoError('Odmocnina ze záporného čísla', n.line); }
                return Math.sqrt(N(0));
            case 'SIN': return Math.sin(N(0) * Math.PI / 180);
            case 'COS': return Math.cos(N(0) * Math.PI / 180);
            case 'ARCTAN': return Math.atan(N(0)) * 180 / Math.PI;
            case 'ABS': return Math.abs(N(0));
            case 'INT': return Math.trunc(N(0));
            case 'NOT': return N(0) ? 0 : 1;
            case 'REMAINDER':
                if (N(1) === 0) { throw LogoError('Dělení nulou', n.line); }
                return N(0) % N(1);
            case 'POWER': return Math.pow(N(0), N(1));
            case 'MIN': return Math.min(N(0), N(1));
            case 'MAX': return Math.max(N(0), N(1));
            case 'AND': return (N(0) && N(1)) ? 1 : 0;
            case 'OR': return (N(0) || N(1)) ? 1 : 0;
            case 'XCOR': return t.x;
            case 'YCOR': return t.y;
            case 'HEADING': return t.h;
            case 'PI': return Math.PI;
        }
        return 0;
    }

    function enter(n, env) {
        var proc = env.procs[n.name];
        if (env.depth >= MAX_DEPTH) { throw LogoError('Příliš hluboká rekurze (' + MAX_DEPTH + ' úrovní) – chybí podmínka ukončení?', n.line); }
        var scope = {};
        proc.params.forEach(function (pn, i) { scope[pn] = ev(n.args[i], env); });
        env.scopes.push(scope);
        env.depth++;
        return proc;
    }

    function leave(env) { env.scopes.pop(); env.depth--; }

    function callSync(n, env) {
        var proc = enter(n, env);
        try {
            var g = execList(proc.body, env);
            while (!g.next().done) { /* bez animace */ }
        } catch (e) {
            if (e instanceof OutSig) { return e.value; }
            if (e instanceof StopSig) { return 0; }
            throw e;
        } finally {
            leave(env);
        }
        return 0;
    }

    function resolveColor(v, line) {
        if (typeof v === 'number') { return PALETTE[((Math.round(v) % 16) + 16) % 16]; }
        if (typeof v === 'string') {
            var u = norm(v);
            if (COLOR_NAMES[u] !== undefined) { return PALETTE[COLOR_NAMES[u]]; }
            if (EXTRA_COLORS[u]) { return EXTRA_COLORS[u]; }
            throw LogoError('Neznámá barva „' + v + '“', line);
        }
        if (Array.isArray(v) && v.length === 3) {
            var c = v.map(function (x) { return Math.max(0, Math.min(255, Math.round(num(x, line, 'Barva')))); });
            return 'rgb(' + c.join(',') + ')';
        }
        throw LogoError('Barva musí být jméno, číslo 0–15 nebo [r g b]', line);
    }

    function* execList(list, env) {
        for (var i = 0; i < list.length; i++) { yield* execStmt(list[i], env); }
    }

    function* execStmt(s, env) {
        if (++env.idle >= 1500) { env.idle = 0; yield 0; }
        var t = env.t, a = s.args, d;
        switch (s.type) {
            case 'FD': yield* forward(num(ev(a[0], env), s.line, 'FD'), env); break;
            case 'BK': yield* forward(-num(ev(a[0], env), s.line, 'BK'), env); break;
            case 'RT': t.h = mod360(t.h + num(ev(a[0], env), s.line, 'RT')); yield 1; break;
            case 'LT': t.h = mod360(t.h - num(ev(a[0], env), s.line, 'LT')); yield 1; break;
            case 'PU': t.pd = false; break;
            case 'PD': t.pd = true; break;
            case 'HT': t.vis = false; break;
            case 'ST': t.vis = true; break;
            case 'HOME': moveTo(env, 0, 0); t.h = 0; yield 1; break;
            case 'CS': env.gfx.clear(); t.x = 0; t.y = 0; t.h = 0; yield 1; break;
            case 'CLEAN': env.gfx.clear(); break;
            case 'SETXY':
                moveTo(env, num(ev(a[0], env), s.line, 'SETXY'), num(ev(a[1], env), s.line, 'SETXY'));
                yield 1; break;
            case 'SETX': moveTo(env, num(ev(a[0], env), s.line, 'SETX'), t.y); yield 1; break;
            case 'SETY': moveTo(env, t.x, num(ev(a[0], env), s.line, 'SETY')); yield 1; break;
            case 'SETH': t.h = mod360(num(ev(a[0], env), s.line, 'SETH')); yield 1; break;
            case 'SETPC': t.color = resolveColor(ev(a[0], env), s.line); break;
            case 'SETBG': env.gfx.setBg(resolveColor(ev(a[0], env), s.line)); break;
            case 'SETPS': t.size = Math.max(1, num(ev(a[0], env), s.line, 'SETPS')); break;
            case 'REPEAT':
                d = Math.floor(num(ev(a[0], env), s.line, 'REPEAT'));
                for (var r = 0; r < d; r++) { yield* execList(a[1], env); }
                break;
            case 'IF':
                if (num(ev(a[0], env), s.line, 'IF')) { yield* execList(a[1], env); }
                break;
            case 'IFELSE':
                yield* execList(num(ev(a[0], env), s.line, 'IFELSE') ? a[1] : a[2], env);
                break;
            case 'MAKE': setVar(env, a[0], ev(a[1], env)); break;
            case 'PRINT': env.print(fmt(ev(a[0], env))); break;
            case 'LABEL': env.gfx.label(fmt(ev(a[0], env)), t.x, t.y, t.color); break;
            case 'STOP': throw new StopSig();
            case 'OUTPUT': throw new OutSig(ev(a[0], env));
            case 'call':
                var proc = enter(s, env);
                try {
                    yield* execList(proc.body, env);
                } catch (e) {
                    if (!(e instanceof StopSig || e instanceof OutSig)) { throw e; }
                } finally {
                    leave(env);
                }
                break;
        }
    }

    function mod360(h) { return ((h % 360) + 360) % 360; }

    function moveTo(env, x, y) {
        var t = env.t;
        if (t.pd) { env.gfx.line(t.x, t.y, x, y, t.color, t.size); }
        t.x = x; t.y = y;
    }

    function* forward(dist, env) {
        var t = env.t, total = Math.abs(dist);
        if (total === 0) { return; }
        var sgn = dist < 0 ? -1 : 1;
        var step = Math.max(6, total / 300);
        var left = total;
        while (left > 0) {
            var dd = Math.min(step, left);
            var rad = t.h * Math.PI / 180;
            var nx = t.x + sgn * dd * Math.sin(rad), ny = t.y + sgn * dd * Math.cos(rad);
            if (t.pd) { env.gfx.line(t.x, t.y, nx, ny, t.color, t.size); }
            t.x = nx; t.y = ny;
            left -= dd;
            yield 1;
        }
    }

    // ---------- UI ----------
    var screen = document.getElementById('screen');
    var sctx = screen.getContext('2d');
    var ink = document.createElement('canvas');
    ink.width = W; ink.height = H;
    var ictx = ink.getContext('2d');
    ictx.lineCap = 'round';

    var codeEl = document.getElementById('code');
    var outEl = document.getElementById('out');
    var speedEl = document.getElementById('speed');
    var cmdEl = document.getElementById('cmd');
    var exSel = document.getElementById('examples');

    var bg = '#0b0e12';
    var gfx = {
        line: function (x0, y0, x1, y1, color, size) {
            ictx.strokeStyle = color;
            ictx.lineWidth = size;
            ictx.beginPath();
            ictx.moveTo(W / 2 + x0, H / 2 - y0);
            ictx.lineTo(W / 2 + x1, H / 2 - y1);
            ictx.stroke();
        },
        clear: function () { ictx.clearRect(0, 0, W, H); },
        setBg: function (c) { bg = c; },
        label: function (text, x, y, color) {
            ictx.fillStyle = color;
            ictx.font = '18px sans-serif';
            ictx.textBaseline = 'alphabetic';
            ictx.fillText(text, W / 2 + x, H / 2 - y);
        }
    };

    function newTurtle() { return { x: 0, y: 0, h: 0, pd: true, color: '#ffffff', size: 2, vis: true }; }

    var turtle = newTurtle();
    var globals = {};
    var env = null;      // aktuální prostředí
    var gen = null;
    var acc = 0;

    function print(msg, cls) {
        var line = document.createElement('div');
        if (cls) { line.className = cls; }
        line.textContent = msg;
        outEl.appendChild(line);
        outEl.scrollTop = outEl.scrollHeight;
    }

    function clearOut() { outEl.textContent = ''; }

    function makeEnv(procs) {
        return { t: turtle, scopes: [globals], procs: procs, depth: 0, idle: 0, gfx: gfx, print: function (m) { print(m); } };
    }

    function reportError(e) {
        if (e && e.logo) {
            print('Chyba' + (e.line ? ' (řádek ' + e.line + ')' : '') + ': ' + e.message, 'err');
        } else if (e instanceof RangeError) {
            print('Chyba: příliš hluboké zanoření (nekonečná rekurze?)', 'err');
        } else {
            print('Interní chyba: ' + (e && e.message), 'err');
        }
    }

    function start(list, procs) {
        env = makeEnv(procs);
        gen = execList(list, env);
    }

    function stopRun() { gen = null; }

    function resetAll() {
        stopRun();
        gfx.clear();
        turtle = newTurtle();
        globals = {};
        bg = '#0b0e12';
    }

    document.getElementById('run').addEventListener('click', function () {
        var prog;
        clearOut();
        try {
            prog = parseProgram(codeEl.value);
        } catch (e) { reportError(e); return; }
        resetAll();
        start(prog.main, prog.procs);
    });

    document.getElementById('stop').addEventListener('click', function () {
        if (gen) { stopRun(); print('Zastaveno.'); }
    });

    document.getElementById('clear').addEventListener('click', function () {
        resetAll();
        clearOut();
        print('Hotovo.');
    });

    document.getElementById('png').addEventListener('click', function () {
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var x = c.getContext('2d');
        x.fillStyle = bg;
        x.fillRect(0, 0, W, H);
        x.drawImage(ink, 0, 0);
        c.toBlob(function (blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'logo.png';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        });
    });

    cmdEl.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !cmdEl.value.trim()) { return; }
        var line = cmdEl.value;
        cmdEl.value = '';
        print('? ' + line);
        try {
            var known = {};
            try { known = parseProgram(codeEl.value).procs; } catch (x) { known = {}; }
            var prog = parseProgram(line, known);
            var procs = Object.assign({}, known, prog.procs);
            start(prog.main, procs);
        } catch (err) { reportError(err); }
    });

    function persist() {
        try { localStorage.setItem('logo.code', codeEl.value); } catch (e) { /* ignorovat */ }
    }
    codeEl.addEventListener('input', persist);
    codeEl.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            var s = codeEl.selectionStart;
            codeEl.value = codeEl.value.slice(0, s) + '  ' + codeEl.value.slice(codeEl.selectionEnd);
            codeEl.selectionStart = codeEl.selectionEnd = s + 2;
        }
    });

    // ---------- Ukázky ----------
    var EXAMPLES = [
        ['— vyber ukázku —', null],
        ['Čtverec', 'OPAKUJ 4 [VPRED 150 VPRAVO 90]\n'],
        ['Hvězda', 'BARVA "yellow\nOPAKUJ 5 [VPRED 250 VPRAVO 144]\n'],
        ['Kruh z čtverců',
            'BARVA "cyan\nOPAKUJ 36 [\n  OPAKUJ 4 [VPRED 100 VPRAVO 90]\n  VPRAVO 10\n]\n'],
        ['Spirála',
            'PRIKAZ spirala :d\n  KDYZ :d > 400 [ZASTAV]\n  VPRED :d\n  VPRAVO 91\n  spirala :d + 2\nKONEC\n\nBARVA "green\nspirala 1\n'],
        ['Duhová spirála',
            'UDELEJ "i 0\nOPAKUJ 150 [\n  BARVA ZBYTEK :i 15 + 1\n  VPRED :i * 3 + 5\n  VPRAVO 89\n  UDELEJ "i :i + 1\n]\n'],
        ['Květina',
            'PRIKAZ lupen\n  OPAKUJ 2 [OPAKUJ 45 [VPRED 3 VPRAVO 2] VPRAVO 90]\nKONEC\n\nBARVA "red\nOPAKUJ 18 [lupen VPRAVO 20]\nBARVA "green\nVPRAVO 180 VPRED 200\n'],
        ['Strom (rekurze)',
            'PRIKAZ strom :d\n  KDYZ :d < 8 [ZASTAV]\n  VPRED :d\n  VLEVO 30 strom :d * 0.7\n  VPRAVO 60 strom :d * 0.7\n  VLEVO 30 VZAD :d\nKONEC\n\nSKRYJ\nNAHORU VZAD 300 DOLU\nBARVA "green\nstrom 110\n'],
        ['Kochova vločka',
            'PRIKAZ koch :d :n\n  KDYZ :n = 0 [VPRED :d ZASTAV]\n  koch :d / 3 :n - 1  VLEVO 60\n  koch :d / 3 :n - 1  VPRAVO 120\n  koch :d / 3 :n - 1  VLEVO 60\n  koch :d / 3 :n - 1\nKONEC\n\nSKRYJ\nNAHORU SETXY -220 120 DOLU\nBARVA "cyan\nOPAKUJ 3 [koch 440 3 VPRAVO 120]\n'],
        ['Slunce',
            'BARVA "yellow\nTLOUSTKA 3\nOPAKUJ 36 [VPRED 200 VZAD 200 VPRAVO 10]\nBARVA "orange\nOPAKUJ 36 [VPRED 120 VZAD 120 VPRAVO 10 + 0]\n'],
        ['Náhodné čáry',
            'OPAKUJ 60 [\n  BARVA NAHODA 16\n  VPRED NAHODA 120\n  VPRAVO NAHODA 360\n  KDYZ ODMOCNINA XCOR * XCOR + YCOR * YCOR > 350 [DOMU]\n]\n']
    ];

    EXAMPLES.forEach(function (e, i) {
        var o = document.createElement('option');
        o.value = i;
        o.textContent = e[0];
        exSel.appendChild(o);
    });

    exSel.addEventListener('change', function () {
        var ex = EXAMPLES[parseInt(exSel.value, 10)];
        if (!ex[1]) { return; }
        codeEl.value = ex[1];
        persist();
        document.getElementById('run').click();
        exSel.value = 0;
    });

    try {
        var saved = localStorage.getItem('logo.code');
        codeEl.value = saved !== null ? saved : EXAMPLES[2][1];
    } catch (e) { codeEl.value = EXAMPLES[2][1]; }

    // ---------- Hlavní smyčka ----------
    function rate() {
        var v = parseInt(speedEl.value, 10);
        return 0.15 * Math.pow(1.13, v);
    }

    function frame() {
        if (gen) {
            acc += rate();
            var budget = Math.floor(acc);
            acc -= budget;
            var t0 = performance.now();
            try {
                while (gen && budget > 0 && performance.now() - t0 < 12) {
                    var r = gen.next();
                    if (r.done) { gen = null; print('Hotovo.', 'ok'); break; }
                    if (r.value === 1) { budget--; }
                }
            } catch (e) {
                gen = null;
                if (!(e instanceof StopSig) && !(e instanceof OutSig)) { reportError(e); } else { print('Hotovo.', 'ok'); }
            }
        }
        render();
        requestAnimationFrame(frame);
    }

    function render() {
        sctx.fillStyle = bg;
        sctx.fillRect(0, 0, W, H);
        sctx.drawImage(ink, 0, 0);
        if (!turtle.vis) { return; }
        sctx.save();
        sctx.translate(W / 2 + turtle.x, H / 2 - turtle.y);
        sctx.rotate(turtle.h * Math.PI / 180);
        sctx.beginPath();
        sctx.moveTo(0, -14);
        sctx.lineTo(9, 10);
        sctx.lineTo(0, 5);
        sctx.lineTo(-9, 10);
        sctx.closePath();
        sctx.fillStyle = '#3ddc84';
        sctx.strokeStyle = '#ffffff';
        sctx.lineWidth = 1.5;
        sctx.fill();
        sctx.stroke();
        sctx.restore();
    }

    document.getElementById('run').click();
    requestAnimationFrame(frame);
})();
