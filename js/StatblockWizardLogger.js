"use strict";
window.addEventListener('load', StartLogger, false);

var Viewer;
var Logger;
var Content = "";
var sectionid = -1;
var clickid = -1;
let Statblock;
let StatblockName;
let maxhp = 0;
let currenthp = 0;
let currenttemphp = 0;
let showScoreLogLine = false;
const db = new DB();
let restoring = false;

//#region initialize
function StartLogger() {
    if (StartNewLogger()) {
        // allow dropping of json file
        Viewer.addEventListener('dragover', (event) => {
            event.preventDefault();
        });
        Viewer.addEventListener('drop', (event) => {
            if (event.dataTransfer.files.length == 1) {
                var fr = new FileReader();
                fr.onload = function () { ProcessSVGFile(fr.result) }
                fr.readAsText(event.dataTransfer.files[0]);
            }
            event.preventDefault();
        });

        CreateControls();
    };
}

function StartNewLogger() {
    Viewer = document.getElementById('Statblock');
    Logger = document.getElementById('Log');
    if (Viewer && Logger) {
        AddLoggerStyle();
        LogStartSession();
        return true
    }
    return false
}

function CreateControls() {
    let c = document.getElementById('Controls');
    c.innerHTML = null;
    AddControlsManualInput(c);
    AddControlsDownloadLog(c);
    AddControlsOpenLog(c);
    AddControlsOpenSVG(c);
    AddControlsRestoreLastSession(c);
    AddNewSessionFromRestoredCurrent(c);

    SetFocus();
}

function SetFocus() {
    let t = document.getElementById('textinput');
    if (t) { t.focus(); };
}
//#endregion initialize

//#region StatblockWizardSVGhandling
function ProcessSVGFile(filecontent) {
    if (filecontent) {
        db.setkeyvalue('statblock', filecontent);
        Viewer.innerHTML = filecontent;
        GOLogger();
    }
}

function GOLogger() {
    ResetClickIDs();
    StatblockName = GetStatblockName();
    if (StatblockName) { AddLogLine(StatblockName + ' enters.', { bold: true }) };
    GetFeatures();
    GetActions();
    SetFocus()
}

function GetStatblockName() {
    let e = document.getElementsByClassName('StatblockWizard-title');
    if (e.length > 0) {
        return e[0].innerText.split(/[\n,]/g)[0];
    }
    return '';
}

function GetFeatures() {
    GetHP();
    GetStringList('StatblockWizard-speed', (source) => `${SanitizeSpeed(source)}.`);
    GetStringList('StatblockWizard-savingthrows', (source) => `${SanitizeSavingThrows(source)} saving throw.`);
    GetSkills();
    GetStringList('StatblockWizard-vulnerabilities', (source) => `Is vulnerable to ${source}.`);
    GetStringList('StatblockWizard-resistances', (source) => `Resists ${source}.`);
    GetStringList('StatblockWizard-immunities', (source) => `Is immune to ${source}.`);
    GetStringList('StatblockWizard-senses', (source) => `Perceives using ${source}.`);
    GetStringList('StatblockWizard-languages', (source) => `Role play: uses language ${source}.`);
}

function GetHP() {
    let elementlist = document.getElementsByClassName('StatblockWizard-hitpoints');
    if (elementlist.length > 0) {
        for (var l = 0; l < elementlist.length; l++) {
            let elementvaluekeyword = elementlist[l].getElementsByClassName('StatblockWizard-keyword');
            if (elementvaluekeyword.length > 0) {
                let elementvaluelistelement = elementvaluekeyword[0].nextElementSibling;
                let hptext = elementvaluelistelement.innerText.replace(/^([0-9]*)[\.]*/, "$1");
                let hp = Number.parseInt(hptext);
                SetMaxHP(hp);
            }
        }
    }
}

function GetSkills() {
    let skills = document.getElementsByClassName('StatblockWizard-skill'); // these are SPANs already, just add class and event
    if (skills.length > 0) {
        for (var i = 0; i < skills.length; i++) {
            skills[i].classList.add('selectable');
            let skilltext = skills[i].innerText;
            skills[i].addEventListener('click', () => {
                AddLogLine(`Uses skill ${skilltext}.`);
            });
        }
    }
}

function GetStringList(cssclass, formatfunction) {
    let elementlist = document.getElementsByClassName(cssclass);
    if (elementlist.length > 0) {
        for (var l = 0; l < elementlist.length; l++) {
            let elementvaluekeyword = elementlist[l].getElementsByClassName('StatblockWizard-keyword');
            if (elementvaluekeyword.length > 0) {
                let elementvaluelistelement = elementvaluekeyword[0].nextElementSibling;
                let elementvalueseparator = (elementvaluelistelement.innerText.indexOf(';') >= 0) ? ';' : ','
                let elementvalues = elementvaluelistelement.innerText.split(elementvalueseparator);
                elementvaluelistelement.innerHTML = '';
                for (var i = 0; i < elementvalues.length; i++) {
                    elementvaluelistelement.appendChild(NewClickableSpan(elementvalues[i], formatfunction(elementvalues[i])));
                    if (i < elementvalues.length - 1) { elementvaluelistelement.insertAdjacentText("beforeend", `${elementvalueseparator} `); }
                }
            }
        }
    }
}

function GetActions() {
    GetSectionData(document.getElementsByClassName('StatblockWizard-characteristics'), 'Role plays', 'characteristic');
    GetSectionData(document.getElementsByClassName('StatblockWizard-specialtraits'), 'Uses special trait', 'specialtrait');
    GetSectionData(document.getElementsByClassName('StatblockWizard-actions'), 'Takes action', 'action');
    GetSectionData(document.getElementsByClassName('StatblockWizard-bonusactions'), 'Takes bonus action', 'bonusaction');
    GetSectionData(document.getElementsByClassName('StatblockWizard-reactions'), 'Reacts', 'reaction');
    GetSectionData(document.getElementsByClassName('StatblockWizard-legendaryactions'), 'Uses legendary action', 'legendaryaction');
    GetSectionData(document.getElementsByClassName('StatblockWizard-epicactions'), 'Uses epic action', 'epicaction');
}

function GetSectionData(s, caption, prefix) {

    ResetSectionIDs();

    if (s.length > 0) {
        var currentKeyword = '';
        var currentKeywordHandled = true;
        var currentKeywordStartID;
        var newKeyword;
        var lineType;
        var currentSectionID;

        let l = s[0].getElementsByClassName('StatblockWizard-line');
        for (var i = 0; i < l.length; i++) {
            currentSectionID = NewSectionID();
            l[i].id = CreateID(prefix, currentSectionID);

            lineType = GetTypeFromClassList(l[i]);
            switch (lineType) {
                case 'StatblockWizard-namedstring':
                    newKeyword = GetFirstKeyword(l[i]);
                    // check if it is an actual keyword. Definition: 3 characters or longer. If not, this one belongs to the previous keyword
                    if (newKeyword.length >= 3) {
                        if (!currentKeywordHandled) { CreateClickableDiv(currentKeywordStartID, currentSectionID - 1, caption, prefix, currentKeyword) };
                        currentKeyword = newKeyword;
                        currentKeywordHandled = false;
                        currentKeywordStartID = currentSectionID;
                    }
                    break;
                case 'StatblockWizard-list-ul':
                case 'StatblockWizard-list-ol':
                case 'StatblockWizard-text':
                    // extend selecton, don't log
                    if (currentKeyword == '') { //section starts with plain text, e.g. a Legedary Actions section}
                        currentKeyword = caption;
                        currentKeywordHandled = false;
                        currentKeywordStartID = currentSectionID;
                    }
                    break;
                case 'StatblockWizard-weapon':
                    if (!currentKeywordHandled) { CreateClickableDiv(currentKeywordStartID, currentSectionID - 1, caption, prefix, currentKeyword); };
                    currentKeyword = GetFirstKeyword(l[i]);
                    currentKeywordStartID = currentSectionID;
                    CreateClickableDiv(currentKeywordStartID, currentSectionID, caption, prefix, `Attacks using ${currentKeyword}`);
                    currentKeywordHandled = true;
                    break;
                case 'StatblockWizard-list-dl':
                    CreateKeywordClickableDiv(l[i], caption, ((currentKeyword == caption) ? '' : currentKeyword));
                    currentKeywordHandled = true;
                    break;
                case 'StatblockWizard-list-spells5e':
                    CreateClickableSpellsSpan(l[i]);
                    currentKeywordHandled = true;
                    break;
                default:
                    break;
            }
        };
        if (!currentKeywordHandled) { CreateClickableDiv(currentKeywordStartID, currentSectionID, caption, prefix, currentKeyword); };
    }
}

function GetTypeFromClassList(e) {
    let cl = e.classList;
    for (var i = 0; i < cl.length; i++) {
        if (cl[i] != 'StatblockWizard-line') { return cl[i] };
    }
    return ''
}

function GetFirstKeyword(fromelement) {
    let k = fromelement.getElementsByClassName('StatblockWizard-keyword');
    if (k.length > 0) {
        return (SanitizeKeyword(k[0].innerText))
    }
    return null;
}

function ResetSectionIDs() {
    sectionid = -1;
}

function NewSectionID() {
    sectionid++;
    return (sectionid);
}

function ResetClickIDs() {
    sectionid = -1;
}

function NewClickID() {
    clickid++;
    return (clickid);
}

function CreateID(prefix, ID) {
    return (`${prefix}-${ID}`);
}

function CreateClickableDiv(fromID, uptoID, caption, prefix, keyword) {
    let D = NewClickableDiv(caption, keyword);
    let c = document.getElementById(CreateID(prefix, fromID));
    if (c) {
        c.insertAdjacentElement('beforebegin', D);

        for (var i = fromID; i <= uptoID; i++) {
            let e = document.getElementById(CreateID(prefix, i));
            if (e) { D.appendChild(e); };
        }
    }
}

function CreateKeywordClickableDiv(fromelement, caption, keyword) {
    // fromelement is a dl. Keywords are in a dt element; nextElementsibling will be the matching dd
    let k = fromelement.getElementsByClassName('StatblockWizard-keyword');
    for (var i = 0; i < k.length; i++) {
        let D = NewClickableDiv(caption, `${keyword.replace('.', ',')} ${SanitizeKeyword(k[i].innerText)}`);
        k[i].insertAdjacentElement('beforebegin', D);
        let dd = k[i].nextElementSibling;
        D.appendChild(k[i]);
        D.appendChild(dd);
    }
}

function NewClickableDiv(caption, keyword) {
    let D = document.createElement('div');
    D.classList.add('selectable');
    // D.id = CreateID('click', NewClickID());
    D.addEventListener('click', () => {
        AddLogLine((caption != keyword) ? `${caption}: ${keyword.replace(':','.')}` : `${caption}.`);
    });
    return (D);
}

function NewClickableSpan(content, message) {
    let S = document.createElement('span');
    S.innerText = content;
    S.classList.add('selectable');
    S.addEventListener('click', () => {
        AddLogLine(message);
    });
    return (S);
}

function CreateClickableSpellsSpan(fromelement) {
    // fromelement is a dl. Spell levels are in a dt element;
    // nextElementsibling will be the matching dd.
    // In the dd are spell names, each enclosed in a span(class=StatblockWizard-spell)
    let s = fromelement.getElementsByClassName('StatblockWizard-spellliststart');
    for (var l = 0; l < s.length; l++) {
        let spelllevelname = SanitizeSpellLevelCaption(s[l].innerText);
        let spellnamelist = s[l].nextElementSibling;
        let spellnames = spellnamelist.getElementsByClassName('StatblockWizard-spell');
        for (var n = 0; n < spellnames.length; n++) {
            spellnames[n].classList.add('selectable');
            let spelltext = SanitizeKeyword(spellnames[n].innerText);
            spellnames[n].addEventListener('click', () => {
                AddLogLine(`Casts ${spelllevelname} ${spelltext}.`);
            });
        }
    }
}

function SanitizeKeyword(keyword = "") {
    // removes parts in parenthesis
    // removes leading and trailing spaces
    let r = /\s*\([^\)]*\)\s*/g
    return (keyword.replace(r, '').trim());
}

function SanitizeSpellLevelCaption(levelcaption = "") {
    // removes parts in parenthesis, trailing colon or period, and the s from Cantrips
    // adds ' spell' for all except cantrips
    // removes leading and trailing spaces
    let r = /[s]*\s*\([^\)]*\)[\s\:\.]*$|[s]*[\s\:\.]*$/g;
    let s = levelcaption.toLocaleLowerCase().replace(r, '').trim();
    return ((s.includes('cantrip')) ? s : `${s} spell`);
}

function SanitizeSpeed(speed) {
    // keep only text before digits.
    // if empty, return 'Move'
    let r = /\s*[0-9]+[ft\.\s]*/g;
    let s = speed.replace(r, '').trim();
    s = (s == '') ? 'Move' : s;
    s = s.substring(0, 1).toUpperCase() + s.substring(1);
    return (s);
}

function SanitizeSavingThrows(st) {
    // if starts with "3-letter ability", space, + then return only the 3 letters
    if (['str', 'dex', 'con', 'int', 'wis', 'cha'].indexOf(st.trim().substring(0, 3).toLocaleLowerCase()) >= 0) {
        return (st.trim().substring(0, 3))
    }
    return (st.trim());
}
//#endregion StatblockWizardSVGhandling

//#region CurrentStatushandling
function GetSessionNo() {
    let sessionno = Logger.getAttribute('sessionno');
    return ((Number.isNaN(sessionno) ? 1 : Number.parseInt(sessionno)));
}

function SetSessionNo(sessionno) {
    Logger.setAttribute('sessionno', sessionno);
    Logger.firstElementChild.innerText = `LOG #${sessionno}`;
    if (sessionno > 1) AddLogLine(`Playing ${StatblockName}. ${GetScoreText()}`, { bold: true });
}

function GetStatusFromLog() {
    currenthp = Number.parseInt(Logger.getAttribute('hp'));
    maxhp = Number.parseInt(Logger.getAttribute('maxhp'));
    currenttemphp = Number.parseInt(Logger.getAttribute('temphp'));
}

function SetStatusInLog() {
    Logger.setAttribute('hp', currenthp);
    Logger.setAttribute('maxhp', maxhp);
    Logger.setAttribute('temphp', currenttemphp);
}

function SetMaxHP(hp) {
    maxhp = hp;
    currenthp = hp;
    currenttemphp = 0;
    SetStatusInLog();
    AddLogLine(`${StatblockName} has ${currenthp} hit points.`);
}

function SetHP(newhp, newtemphp) {
    if (newhp < -maxhp) {
        AddLogLine(`RIP ${StatblockName}`);
        currenthp = 0;
        currenttemphp = 0;
        maxhp = 0;
    } else {
        currenthp = (newhp < 0) ? 0 : ((newhp > maxhp) ? maxhp : newhp);
    }
    currenttemphp = (newtemphp < 0) ? 0 : newtemphp;
    SetStatusInLog();
    showScoreLogLine = true;
}

function receiveDamage(damage) {
    let hp = currenthp;
    let temphp = currenttemphp;
    if (damage >= temphp) {
        damage = damage - temphp;
        temphp = 0;
    } else {
        temphp = temphp - damage;
        damage = 0;
    };
    hp = hp - damage;
    SetHP(hp, temphp);
}

function receiveHealing(healing) {
    SetHP(currenthp + healing, currenttemphp);
}

function receiveTempHP(temphp) {
    if (temphp < currenttemphp) AddLogLine(`Received temporary hit points (${temphp}) are fewer than current temporary hp ${currenttemphp} - no change applied.`, { logscore: true });
    SetHP(currenthp, (temphp > currenttemphp) ? temphp : currenttemphp);
}
//#endregion CurrentStatushandling

//#region Loghandling
function LogStartSession() {
    let previoussession = Logger.getAttribute('startdatetime');
    let sessionno = 1;
    if (previoussession) {
        Logger.setAttribute('previousstartdatetime', previoussession);
        sessionno = GetSessionNo() + 1;
    }
    Logger.setAttribute('startdatetime', (new Date().toISOString()));
    SetSessionNo(sessionno);
}

function AddLogLine(rawtext, options = { bold: false, italic: false, logscore: false }) {
    let text = rawtext.replace(/[\s\n]*$/, '')
    if (text) {
        let addtime = true;

        showScoreLogLine = false;
        let texts = text.split(/\n/g);
        texts.forEach((line) => {
            let linecss = ['logline'];
            if (options.bold) { linecss.push('bold'); }
            if (options.italic) { linecss.push('italic'); }
            if (options.logscore) { linecss.push('logscore'); }

            let td1content;
            if (addtime && !options.logscore) {
                td1content = new Date().toTimeString().substring(0, 8);
                addtime = false;
            } else {
                td1content = '&nbsp;';
            };

            CreateLogLine(linecss, td1content, 'logtime', UseFormatting(line), 'logtext', !showScoreLogLine);
            parseSingleLogLine(line); // may scroll even more
        });
        if (showScoreLogLine) AddScoreLogLine();
        if (!restoring) {
            db.setkeyvalue('log', Logger.outerHTML.normalize());
            DisableSessionControlButtons();
        }
    }
    SetFocus();
}

function AddScoreLogLine() {
    CreateLogLine('loglinescores', '&nbsp;', 'logtime', GetScoreText(), 'logscore', true);
}

function CreateLogLine(linecss, col1content, col1css, col2content, col2css, scrollIntoView = false) {
    let tr = document.createElement('tr');
    AddCss(tr, linecss);

    let td1 = document.createElement('td');
    td1.innerHTML = col1content;
    AddCss(td1, col1css);

    let td2 = document.createElement('td');
    td2.innerHTML = col2content;
    AddCss(td2, col2css);

    tr.appendChild(td1);
    tr.appendChild(td2);
    let Loglines = document.getElementById('Loglines');
    Loglines.appendChild(tr);

    showScoreLogLine = false;
    if (scrollIntoView) tr.scrollIntoView();
}

function AddCss(to, css) {
    if (css) {
        if (Array.isArray(css)) {
            css.forEach((c) => { to.classList.add(c) });
        }
        else {
            to.classList.add(css);
        };
    }
}

function GetScoreText() {
    let scoretext = (currenthp > 0) ? `Current hit points: ${currenthp}` : (maxhp > 0) ? `${StatblockName} is unconscious (0 HP)` : `${StatblockName} ded. Really.`;
    if (currenttemphp > 0) scoretext = `${scoretext}, Temporary hit points: ${currenttemphp}`;
    if ((currenthp > 0) && (currenttemphp > 0)) scoretext = `${scoretext}. Total hit points: ${currenthp + currenttemphp}.`;
    return scoretext;
}

function parseSingleLogLine(line) {
    parseSingleLogLineRegex(line, /^damage[\s]*([0-9]*)$/i, parseDamage);
    parseSingleLogLineRegex(line, /^heal[\s]*([0-9]*)$/i, parseHeal);
    parseSingleLogLineRegex(line, /^temphp[\s]*([0-9]*)$/i, parseTempHP);
    parseSingleLogLineRegex(line, /^session[\s]*([0-9]*)$/i, parseSessionNo);
    if (/^hp$/i.test(line)) showScoreLogLine = true;
}

function parseSingleLogLineRegex(line, regex, handler) {
    if (regex.test(line)) handler(line, regex);
}

function parseDamage(line, regex) {
    receiveDamage(Number.parseInt(line.replace(regex, "$1")));
}

function parseHeal(line, regex) {
    receiveHealing(Number.parseInt(line.replace(regex, "$1")))
}

function parseTempHP(line, regex) {
    receiveTempHP(Number.parseInt(line.replace(regex, "$1")));
}

function parseSessionNo(line, regex) {
    SetSessionNo(Number.parseInt(line.replace(regex, "$1")));
}

function AddLoggerStyle() {
    let style = document.createElement('style');
    style.setAttribute("type", "text/css");
    style.innerHTML = LoggerStyle();
    Logger.insertAdjacentElement('beforebegin', style);
}

function LoggerStyle() {
    return `div#Log{font-size: 16px;}
.logline,.loglinescores{margin:1px;}
.logheadercol1{font-weight:bold;width:16mm;}
.logheadercol2{font-weight:bold;width:99%;}
.logtime{font-size:12px;font-family:sans-serif;vertical-align:text-top;font-weight:bold;width:16mm;}
.logtext{font-size:16px;vertical-align:text-top;}
.logscore{font-size:12px;font-family:sans-serif;}
.bold{font-weight:bold;}
.italic{font-style:italic;}
`
}
//#endregion Loghandling

//#region Controls
function AddControlsManualInput(controls) {
    // input text + submit button
    let i = document.createElement('textarea');
    i.setAttribute("cols", "100");
    i.setAttribute("rows", "3");
    i.setAttribute('title', 'Type text here to be added to the log.')
    i.classList.add('textinput');
    i.id = 'textinput';
    controls.appendChild(i);

    AddManualInputHints(controls);

    let b = INPUTbutton('log', 'l', 'Send the text to the log.', 'textinput');
    b.addEventListener('click', () => { SubmitManualLog(); });
    controls.appendChild(b);
}

function AddManualInputHints(controls) {
    let p = document.createElement('p');
    p.classList.add('hints');
    p.innerHTML = 'HINTS: use <strong>damage</strong>, <strong>heal</strong>, <strong>temphp</strong>, <strong>session</strong>, each followed by a number. Or use <strong>hp</strong>. Enclose text in * for bold, or in _ for italic.';
    controls.appendChild(p);
}

function AddControlsDownloadLog(controls) {
    // download log button; shortcutkey d is not available, use h
    let d = INPUTbutton('download', 'h', 'Download the log as a StatblockWizard log html file.');
    d.classList.add('tooling');
    controls.appendChild(d);
    d.addEventListener('click', () => {
        let sessionno = GetSessionNo();
        let sdt = Logger.getAttribute("startdatetime");
        let dt = `${sdt.substring(8, 10)}-${sdt.substring(5, 7)}-${sdt.substring(0, 4)}`;
        let htmldoc = document.implementation.createHTMLDocument(`${StatblockName} Log#${sessionno} - ${dt}`);
        htmldoc = CreateLogDownloadDocument(htmldoc);
        downloaddocumenthtml(htmldoc, `${StatblockName} Log#${sessionno} - ${dt}`);
    });
}

function AddControlsOpenLog(controls) {
    let selhtml = INPUTfile('.statblockwizard.log.html');
    if (selhtml) {
        selhtml.addEventListener('change', function () {
            var fr = new FileReader();
            fr.onload = function () { RestoreFromLog(fr.result) }
            if (this.files[0] != '') {
                fr.readAsText(this.files[0])
                this.value = ''
                this.content = ''
            }
        })
    }
    let uphtml = INPUTbutton('upload', 'u', 'Upload a StatblockWizard log html file.');
    uphtml.classList.add('tooling');
    controls.appendChild(uphtml);
    uphtml.addEventListener('click', () => {
        selhtml.click();
    });
}

function AddControlsOpenSVG(controls) {
    let selsvg = INPUTfile('.statblockwizard.svg');
    if (selsvg) {
        selsvg.addEventListener('change', function () {
            var fr = new FileReader();
            fr.onload = function () { ProcessSVGFile(fr.result) }
            if (this.files[0] != '') {
                fr.readAsText(this.files[0])
                this.value = ''
                this.content = ''
            }
        })
    }
    let upsvg = INPUTbutton('open statblock', 'o', 'Open a StatblockWizard SVG file.');
    upsvg.classList.add('tooling');
    controls.appendChild(upsvg);
    upsvg.addEventListener('click', () => {
        selsvg.click();
    });
}

function AddControlsRestoreLastSession(controls) {
    let r = INPUTbutton('restore last session', 'r', 'Restore the last session.');
    r.setAttribute('id', 'restore');
    r.classList.add('tooling');
    controls.appendChild(r);
    r.addEventListener('click', () => {
        ResetLog();
        RestoreLastSession();
    });
}

function AddNewSessionFromRestoredCurrent(controls) {
    let n = INPUTbutton('new session using current data', 'n', 'Start a new session, retaining current statblock and data.');
    n.setAttribute('id', 'newsession');
    n.setAttribute('disabled', true); // will only be enabled directly after restoring a log or last session.
    n.classList.add('tooling');
    controls.appendChild(n);
    n.addEventListener('click', () => {
        ContinueFromLastSession();
    });
}
//#endregion Controls

//#region tooling
function INPUTbutton(text, accessKey, alt, classname) {
    let input = document.createElement('input');
    input.setAttribute("type", "button");
    if (accessKey) {
        input.setAttribute('accessKey', accessKey);
        alt = `${alt} (shortcut key: ${accessKey})`.trim();
    };
    if (alt) {
        input.setAttribute('alt', alt.trim());
        input.setAttribute('title', alt.trim());
    };
    input.value = text;
    if (classname) { input.classList.add(classname); };
    return input;
}

function INPUTfile(accept) {
    let input = document.createElement('input');
    input.setAttribute("type", "file");
    if (accept) input.setAttribute('accept', accept);
    return input;
}

function SubmitManualLog() {
    let t = document.getElementById('textinput');
    if (t) {
        AddLogLine(t.value);
        t.value = '';
        t.focus();
    }
}

function CreateLogDownloadDocument(htmldoc = new Document) {
    htmldoc.documentElement.setAttribute("lang", "en");

    let style = `:root{--fore:#020202;--back:#fdfdfd;}
@media(prefers-color-scheme:dark){:root{--fore:#fdfdfd;--back:#404040;}}
*{margin:0;padding:0;}
body{font-family:Georgia,'Times New Roman',Times,serif;text-align:left;color:var(--fore);font-size:4mm;background-color:var(--back);max-width:800px;}
div#Log{font-size:16px;}
.appinfo{margin-left:auto;margin-right:auto;width:fit-content;}
::-webkit-scrollbar{width:10px;height:10px;}
::-webkit-scrollbar-track{background:#f1f1f1;}
::-webkit-scrollbar-thumb{background: #888;}
::-webkit-scrollbar-thumb:hover{background: #555;}
@media print {div#Statblock{display:none}}` + LoggerStyle();
    htmldoc.head.insertAdjacentHTML("beforeend", `<style>${style}</style>`);

    let body = `<h1 class="appinfo">${StatblockName} Log #${GetSessionNo()} Transcript</h1>` +
        '<div id="Statblock" class="appinfo">' + db.getkeyvalue('statblock') + '</div>' +
        db.getkeyvalue('log') + '<!--endlog-->';
    htmldoc.body.innerHTML = body;

    return htmldoc;
}

function downloaddocumenthtml(htmldoc, filename) {
    const file = new Blob(['<!DOCTYPE html>' + '\n' + htmldoc.documentElement.outerHTML], { type: 'text/html' });
    const fileURL = URL.createObjectURL(file);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', fileURL);
    linkElement.setAttribute('download', `${filename}.statblockwizard.log.html`);
    linkElement.click();
    EnableNewSessionButton();
}

function ResetLog() {
    Logger.innerHTML = `<h1 class="appinfo">LOG</h1>
<table><thead><tr><th class="logheadercol1">Time</th><th class="logheadercol2">Events</th></tr></thead>
<tbody id="Loglines"></tbody>
</table>`;
}

function RestoreLastSession() {
    restoring = true;
    let filecontent = db.getkeyvalue('statblock');
    ProcessSVGFile(filecontent);
    let logcontent = db.getkeyvalue('log');
    if (logcontent) Logger.outerHTML = logcontent;
    Logger = document.getElementById('Log');
    GetStatusFromLog();
    DisableSessionControlButtons();
    restoring = false;
    EnableNewSessionButton();
}

function RestoreFromLog(htmlfilecontent) {
    restoring = true;
    ResetLog();
    let start = htmlfilecontent.indexOf('<svg');
    let end = htmlfilecontent.indexOf('</svg>') + 6;
    let filecontent = htmlfilecontent.substring(start, end);

    start = htmlfilecontent.indexOf('<div id="Log"');
    end = htmlfilecontent.indexOf('<!--endlog-->');
    let logcontent = htmlfilecontent.substring(start, end);

    db.setkeyvalue('statblock', filecontent);
    db.setkeyvalue('log', logcontent);
    RestoreLastSession();
}

function DisableSessionControlButtons() {
    let restore = document.getElementById('restore');
    if (restore) restore.setAttribute('disabled', true);
    let newsession = document.getElementById('newsession');
    if (newsession) newsession.setAttribute('disabled', true);
}

function EnableNewSessionButton() {
    let newsession = document.getElementById('newsession');
    if (newsession) newsession.removeAttribute('disabled');
}

function ContinueFromLastSession() {
    ResetLog();
    LogStartSession();
    DisableSessionControlButtons();
}

function UseFormatting(line) {
    line = UseFormattingRegex(line, /(^|[^_]])_\*([^\*]+)\*_([^_]|$)|(^|[^\*])\*_([^_]+)_\*([^\*]|$)/g, UseFormattingBoldItalic); // code must execute before bold or italic
    line = UseFormattingRegex(line, /(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, UseFormattingBold);
    line = UseFormattingRegex(line, /(^|[^_])_([^_]+)_([^_]|$)/g, UseFormattingItalic);
    line = UseFormattingRegex(line, /\*(\*)|_(_)/g, UseFormattingUnDouble);
    return line;
}

function UseFormattingRegex(line, regex, handler) {
    if (regex.test(line)) return handler(line, regex);
    return line; //unchanged
}

function UseFormattingBold(line, regex) {
    return line.replace(regex, '$1<span class="bold">$2</span>$3');
}

function UseFormattingItalic(line, regex) {
    return line.replace(regex, '$1<span class="italic">$2</span>$3');
}

function UseFormattingBoldItalic(line, regex) {
    return line.replace(regex, '$1$4<span class="bold italic">$2$5</span>$3$6');
}

function UseFormattingUnDouble(line, regex) {
    return line.replace(regex, '$1$2');
}
//#endregion tooling

//#region demo
function demodata() {
    return (`<!DOCTYPE html>
    <html lang="en"><head><title>StatblockWizard Logger Log#1 - 10-09-2023</title><style>:root{--fore:#020202;--back:#fdfdfd;}
    @media(prefers-color-scheme:dark){:root{--fore:#fdfdfd;--back:#404040;}}
    *{margin:0;padding:0;}
    body{font-family:Georgia,'Times New Roman',Times,serif;text-align:left;color:var(--fore);font-size:4mm;background-color:var(--back);max-width:800px;}
    div#Log{font-size:16px;}
    .appinfo{margin-left:auto;margin-right:auto;width:fit-content;}
    ::-webkit-scrollbar{width:10px;height:10px;}
    ::-webkit-scrollbar-track{background:#f1f1f1;}
    ::-webkit-scrollbar-thumb{background: #888;}
    ::-webkit-scrollbar-thumb:hover{background: #555;}
    @media print {div#Statblock{display:none}}div#Log{font-size: 16px;}
    .logline,.loglinescores{margin:1px;}
    .logheadercol1{font-weight:bold;width:16mm;}
    .logheadercol2{font-weight:bold;width:99%;}
    .logtime{font-size:12px;font-family:sans-serif;vertical-align:text-top;font-weight:bold;width:16mm;}
    .logtext{font-size:16px;vertical-align:text-top;}
    .logscore{font-size:12px;font-family:sans-serif;}
    .bold{font-weight:bold;}
    .italic{font-style:italic;}
    </style></head><body><h1 class="appinfo">StatblockWizard Logger Log #1 Transcript</h1><div id="Statblock" class="appinfo"><svg xmlns="http://www.w3.org/2000/svg" width="683" height="705" style="font-size:16px;">
    <foreignObject style="width:683px; height:705px; transform:scale(1);">
    <div xmlns="http://www.w3.org/1999/xhtml" style="border:0;padding:0;">
    <style>
    :root {
    --StatblockWizardmonstername: #a00000;
    --StatblockWizardscreenborder: #a00000;
    --StatblockWizardprintborder: #d3d3d3;
    --StatblockWizardtext: #020202;
    }
    
    /* latin-ext */
    @font-face {
    font-family: 'Source Sans Pro';
    font-style: normal;
    font-weight: 400;
    src: local('Source Sans Pro'), url(data:font/woff2;base64,ZDA5R01nQUJBQUFBQUM0UUFBMEFBQUFBZGpnQUFDMjVBQUVBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUdvRVVHNXNzSElGS0JtQUFoMG9LZ1pOUS1Yd0xoV29BQVRZQ0pBT0xCZ1FnQllSbUI1bDdHNUJsQl9EbWlWcnVWbFhvR0VqLWtRajd3VW10TG9xeXlTa0ZfXy1uSkIxak9GWU5STkhmNm9lb3hHVGNvMFV6YXRreEVsay1aZ2FtbFFzTDBSSExDdzZQSHBfV2JQdFNad0dSNEE0Tk9IRXhRVHlLekc4RWxhaEVkZjRlM1E0b3hwMHJxOGJsNUI5VW1XWWZLNnhOX1B4NTRER3ZsZjJKM0Rvb3EyM2wwRGw3VTMtZE5ORmI1MDJSZE93d3RfM1Q5U3Y3UHNnTGQ1cEZYYnJJRVJyN0pKZjRZdXpMZmpOXzl5NUVwSmt0TUNnQ0d4ZVZTbmx5c1dGSkJQTUR2ODNfYzduWEJDeEFNRUdkVkFtb1lCQWxJUXBZaVJXelZpN0tSVHFYNWQ2cWZYdlJidlB2Yi01RnJzSzk1enIwNl9mYnYxS3hNNHQ0V3lJZVRiZmkwc1JTc2tSSU5LWkRhM1lUZlBscFA3Y2xMSXIxalVwbGxVU2ZsRWlJRTFILVZPemRYZWswUE1HekFCRGNZTGhiZGJ4dVh6TUpuTXlRN3F2S2s1QWdaMXBiUmRyUXJxb0FTOEhjZmdnaUJtRllORFZiTktSbUxzSk5yYlg3REtFeVgybTBJaDRxSmVEVGlaNXBabnJxSzNveU9DX2t5UWNWNmlfWDhtQ3pDZjhlNVlHZ2dMSUtRWGQ4dGFfeEZZNm16cW05LUpNdnpIYy04T3ItdnpFMzFCcVBSaWdra2lmcW1mM043XzV0LS1BbExIUTBFU3FsNFptU3dHRHBMcnhRQVJuV3VUX20tVTdIMF9VTHh3NXlscjVDV1lsTkdjdURGS2FWYThUR3BMTHM4RjhDZ0IyNHFEZ3dCUDVfZjZycmY3NVZBeVNWMkVFY2xnTFFoTFRMRDc3MF90TTNTTElkU1NHU1ZaRDhRNkN2X3lOamM1U1V5S2NUQU1zaGdDa25Vd0hZSGRiT0hVYkFkYzB5ZE9ycHRIY2Z1OWZ2Zi0zVnZ2Y25Od2l1cUZZVnlPY0tOMHBITGJ3ay03dG5DcnhOZ2NoLXR4dFZJQmtoUzhjenFpcFN0dkE4emFrdDNPc2ZvZk5KS2t3NnAwSlhfc1BjRUdUZENOMG1nZFhzbEotTklXMEhxdl9sU2tJZUdWdi04bE9iaDlJNlVXU0N5UVl6bktLVnk4ZlhsWFljcTFiNzN2T3FsZUlZakQ1RHJ2OEVCVmdkZ0JJS0I0VklJSU13eTRCd2NVRVVLNGFZYkFyRUNpc2dOdGtNY2RnUmlKTUdJSDd3QTV4el9nX3hxMV9oWEhVVnpvZ1JPQTg4Z1Bqb0V5UUJTQURnUWdrRkVrWmlJWkVtQVJKNWtpRVFZRlZ1bmJERGpyQzVJZTNjZVhzVFNDLWNWVGNDODdKcVp3dUV3d0F6Qm9IZTdodTNiMFFDMzZYbnQtY05XQmFBQUpYazlfMnNYdjNkaWxFRUNCeXdFbTdwU3hoWWZuZlpHNktFQVRINjdJa0hPZi1nU0lULUFCaFhCemxWbXVRWjhvZ0lyZUVMQTZvaGI1Z0dTbHhjeGpQYWlOd3lVQXBmRmJiSUZHSTFMUndCMDc5THYyNHI4NnJMNHJqd2owd3AtOTFGNnFLTVo4S0NGblBKMGpqMUl4eWhKakc2cVRIc2phRWl6MG5mbFhzZUxTMjZYUFZkOFRvVk1rLU9YTkdwM0JLZHgweUppUy1KV29BaU9GRUtySUhFUkJLdUtFNWNFc04zV0NYWHpYZmNGVHB6aXdxR2lWbHkxTnFPMkJDYTJKZDBaVm1CTlo4OFhfRWZxc1MxczFqeW5IanFmTDdmWUM5TWdYb0VOejlMVkdxeWZRMFlGRDFDenFlbTcyd0RFSm5Sa0dZeXdMckxCc1l0SmJOTzctWkFCaWFLdmJCTHZUTUc4Um1DTEVVcUNsX1FQQVZuN0RuVm9ROFcwQW4tQkhySVVyMTRUaWVrbTVEdWZNSVRkOEpYd1p4TTBsdVIyWW1RZ2U4WG9tVFNBbHpJb3RGQm8xRVdvaENrMDAzNkRQVzhkRm9vMkdJSHNVNWVUVnA4Nld1Mmw3dkRIXzZSNWFZUk9mNTFYNUdIa1NxTFBBcTc0TVRCd2NFVGs4RlRTQlJLSlEyQmpRdEJxVktJVGxNUXpMRVEwV0lyLU9peldZQXR0Z3V5d3g1LTlqcUk1SmdCT0tkOEFlZEwwU3JGTjg3emNxSFZFTU4taF9xblZZcExycUc1WWNQYzJiS29IbnFGNm8xUHZJd2h5MENORDBJRWNnSVFDdS1FSnBadjRzSVVHRmI0Z2lPSWhILWtrYUltSVFtd3lDSkRnOE5KYWtDOE1oVndLbUh6NWdsaXF0UmJrWjBtd1pzTW01OHBOcnh1TGNGVXN3WEVoU0FVRXR3bzFDYll5RGFMME9oQWczQVJtVDdnd1I5UTVCTzhBM0dYYkY1R0JOb0p5V3VHdmViampRXzhmZlNScjBfR3dEX0FRSVJBRkR3cE9rb1lZU0FsSnJFb09RQVZ3aUJDLVBTMWtQOUp2bXJiV2xsYzBmdUVvRjdhejhiellUeWlVcTVZRjlUNUhLWUlmMlQ1Rk1PSEZmRnFpZUpCRTRHU3NzdEFGQnpvZGVpNHpGdFdPRlNKdTRkNGxWZlYyX2IwdVNBSDVMZ19jZmhQNC1LY2U3NDBiREFQOUU1TlpSZ2xqaFdNN3ltRXlxZlJfT01ZTkpMRGdDODQ5WnJMQVpsOC0yVmxXdk1iSmhRcUpqX0NiX2xkZVVZd2RjV2lvNktCQlU3c3dBa0lxQjhrZndGLUM1VEFRNFFON0wyb09BcHBmT2lWQ05LZ0E5Y2lpOGdjTlVCT2dMT2k4bzN2cGZyUklJMHpmcWNuUFhEMW41LUV5QlFrV2JTaVNMeEVPaUtCUm16b1RBZ0tCZ0VsRUVBUWdZWVlBQnd3d2NnWFV1QWlBUUtaeUdrWFBGQ0E0RUZDQ0FvTVdDakFRNDR5VWZWRkc0ckZJbzlFV0ZLMDNMRlRrWGRCY09IU3VmektGVmxreHYzc2xmUG1qZldPTERpa3R2OUNnQkFqRnZpR1BvSUFEU1dSb0F4SmhxUEY3VUpPbzB4NEliOTZoRU0tOHQ2UGM3OFNfZlBJUVFPMWVXVGI4WlBZVmtFaDVGcHlYeFFzRGo3TnpBRFpDZEZjdFF2X2hJSjlsM0duSmx4cUpGTlIzb0t6SVBRYk84N2gyNE5lZHFXbkNSZ2NoRk5Heno1UXR1cDl3NzRGdkMyVUtucEVoSkRGODVMQTdLUnppWUdXSDlMTEM5VDlsUThjeTI5aE9ZTTBjYUJXODBKUkRNWGhNQWJZQ0NnQUhIeVkxZ0ZxakNjdTlXaThRYi1aNEswMTVERkFQcTlWd05aUW9BQmZaMzBveEliMXdLdl9NbXBlLUJpMEtsanc1SmZLNlpuNTVReWxHb1BGaHl2aHI0aEtMRjBWYklsR3I0aGVLM29qbUdHSEYzN0U0SUlIcmVpQkhuWjQ4TmtoT2xHSW9oU25KR1dvUUdWcVVOdDhlYjdNR0xBMWpXMEJaTi00amM1cFg3YmxjSDdNaGR6S1NFYnpJbV95b1dpbl9uRFJ5OUdyUm0tSWFVWnM4SUFSUWg2NWFNQk02R0NDNWNNU3FaLW5FdFcwODVFZlZNVHFqSExJOFUxWGxfel9fNWE0LXBQMTBiZHkwMjdPellueXpzSEZ6QlI4LUFqV093VUI0QUpuZ2dHQWhVNHJteFM5WEw1UWpMSkhWR1BYczBoQ3hzREVnZUtTTWNJcmNYallwRlExT3hHQ0syOXZ4X1NPRzUwa3RkRGxXdy0xYlhuZmVmMmc3clNtczFxR3RQMVB4emtOWnd4ZE5QS3pzVjlNX0dyaEQydl8yTGhrNjdLamF3NnUyamthVWNvenZLR3NXa0tWcVZYLTVma19yV3IzMUh1ZzJSUGpQZGZxbWRlT1JLclRHeE85MS1XdHFRRzRNd2hNQ3c3bXhBZm14aGZteFI5NjRnZExFMlJ4QW1CRktQb1NhbVdvVm9WbWRjS3NTYmpOaWJFdDhYYUdyZF9lQ095UHlMNElrOHBsc284MmhVSHFoQ0pYVFBETzJrUllsMGpyRTJWRG9tME1YYUl2WlB2TkZKX1lER3Z4bE1JcDg0T0haUW1XN0N0S1gxUDdrY1pQdEFaWm5HZDFnZFB2Y3Z3cDE5X0szVkxodGhyX3FUV3F6bjBOSG1yMFNKUEgycnpRN3FVT3IwenlRYmN4bUI0VVpnYURXZkdDMmZHR0JTSEF3aEJoU1FKaGVVTDBobVJMNG16Tk9OdkR0Q3NjQnlKMk1CSl9oV3hIV0Q0TDEtN3c3QWtfMXBpVEFjaDFnUG9TWkFHdzl1TWFiSENYQnF1OUJKYl9CRmdDQ2dxQmdfeUFsQkRGRkRBT2otY3o2V1gwZXNRMHhKQ0lPcTU1VEVPYTJMSlItbUlLOUdKMk4yOUd5VkNIQzRxWlRyM1EtSzV2Wk1TaVdURXhhQjB5SXpPLUNFQTNoVW1peE15akVmXzd3Y0Q4bmNuS3FKQ2ZsaERGZFpnWXFLR1U4ZUl6WHA2TWx4c2RxRkdJSHktSEJXSWNLNUZLMlpMU3FLNEJzdGpLeVJsWmtpdmhlNlRxS3JmTjNGYTUzeGtxTFBVS01ybE41NVdpMTFDcWxpcUI1S1h0ZEF6QVhnNGVtU01IMEhROU4wNTZZX3ZBU19XQmxtcXJGcFkzYWlfV3NBdE9tMS1WQS13TXVXYlpnQ1ZXSVFQUU1uMVRZWjMtZU42bG1xOXlqNlpyVWpOVUV6eUdCaUJtaUZoQmJCaG9TMlNEMHdadmRpc1NxbEsxb2JRcFJLVU1rRHJqdHBhajRyYU95Q2pPZks4cXpJclJ6TUtIdlpPdkZBbk5XcE8wdGZyWkZLNWdkUWxYMEFHdzR4eWxVRklPY2hLbElYVEIwOTlqVFpIRFNZSWVKZ3JjZF9uZXg1a3M4aVhSVXYzWUtVdy1wT3lYMDBiWDF2RTdvQ2tUM3JDdEdpY0hMUWdCQTRFRlhTVWIydExLUU10R0pHVGp6TmVBaG1WeWdNeVF3ZmtEMHVldW5sMHJENWxzSkVCdVlQNlZSWmdjQVZmRjRnWU83MFhGdkotVXVncWNuZzRuWVpPanlIVURxYURrUXhodnh5THBvQTRNY2R1cEdya0szelhpRTdsMkpNTzh5MDh4QUNabTRlazZzbmtYdGZlVmVWV2pqbTBNdUliOUxBZTJYMWJMcS1zMGVLRWh0SUFDbG1ESFNDQWRQcjdWR0ljUG9uSS1UQ3Jkam9sR3lObUhTMmdQRk5tTURrdWZwZk1UMVd3RDQ1OGh0T0EzQzZSdlBvbjJDdmZvVU5mUlBFY0FxcUFiM2I4ZFJMekxYWF92NHdZcW95Q0Q2RWt4b0plN1dmWEJ5WG1jOXQzd2pkLUFfNkl5THpHdlY4Z0JxcUFUai16S3cxTUxMQl9OTk5DUkZVcHJjTGFIUFk0VjVFZzJDVFY2TVcwNXV5MXlmdHJjSU9xVERRZnhXQVoxYV9HVUt0STN4RUJIODR0eUNKLTFKUWJyYkx2VlNSNmxROTRPN3NOdVpDNkl1MVJ5VHFRZ1l5ZlYteWdNWW5vRDhsZER4dXhKMFpMcUxQMEJ2aWVVZU9mc3VlV1dFSThsbjAtT3ZDOGVuOEhtaVdRczNZWkx5WEZ4eXBKYnprZzdLVkZtUUlLTGQtN051ZW5PRExFdE1wUTJOQm9lbUR5Sk9Oa042N3lxdVlZZmFSWVBhVEZnQzhadlZsOUZENThsYnhoUmoyWWNCMDMwT1JuTkxRLVZ4SUs3czdhaml3Y2pSWGVBblZVU19WYklYbHIyNjcwaU9YcHJ1UG1PcGFXWFlLZFVtRDl5QmxLTTdzeTlnVzFCOHNqX3U3OUJqelMtTkVSeGpsN3BEUkxuSHBzdHRlOGxPZzcycndURngxS084MWZjeWFUVVQzOG1pVEdFa0FRam9UWkRlb3VtSUoyTThGQnFMTEV4UkRObDZFanREQmdxdHhfYTJXOWQwQ1dveW45Z0dkV2loMjhWUXJsNkY5MlJrLUhzTXB1TkhvUHVfSVNGWXlHaDE4SjQ0TVNWWjFvWWtuYWc0UTA0Y0NKRWxMQy1DMktLeXdTajZOQW1HN3BkZ0FVcHFmZ1lUUDRhNmtYbDZLMXV1cm5kMU4yaHJ1OWhGSk5SbnpEM0FsSnh6cmg4dUdYeTVKeTNsbWFRVVJWNm53U2U4VmlMVjRvWDRyYUhNWTJSTl9jX1JxeGkwMW5vLWhhOUJ6dFZBRlRTczVSWFdDd2VZcUE0TTQ4UVU5VDd0dlpjNnhzbnQ4U0otOVRsMWlFWFhKVUZ6THRaTE50bDlxYk9JRGt5Z0RDYVMxaF9VZHotS3N3VW5DSkxKdkprVm1aR2MydHV5VW1pTE1LM2FJdUtVdTQ5SDZsVkhjbXBZQ01oQUJQZTR2TmVaZHlsU3d4S2FmR3gyLWl1UUlFQ2otYnBrdW1iTER5TWtCR05jM1laUHFKV2ZwMkpldWtBSWFzdVdkQTY5VndLR1NmNFJBQ25hYXAzVEwxeFJzaWVWWVZZTjNTNGlvZExiWVVfMFhpNWNNY3pzNkd6TG41U3U1alF6U0UyS0NMeXh0N2VaSU81OGRMXy13M1U1T3F3eGhIeXN6UnV0bkhGSTVBd3dDU1FZZlF5blZNWUVleHJ2UEhuNjEzMHNIaUh1VGRWTjBmUzEtTXBOajZ6ZExFRkdzVk1GWlgwMkp4Uk1FU09udVNuaWR4RGs0Q1h5ckhSZTZNcUV4RzczTWZHdHVJb1V4Vy1ZUnNEZnpPLWlvcFoyUk90ckJQYkM2OV9WLVcybG1OVm1BcTFPd0VyZjktZEhXVFF3eU13QjFkNURDbGpKRHQ3Q05PUGNrREc0LTdWNnprYmRiYlNvOTc4Q2NSbjlpdnE0NnZRam1KaEM3LUR1bHdidHI1UFFISUZXb2lxVW14aDlLQXd0LVgyRUxjTVo4S0JwRDAwYzNHQlVySFFvS0xTWjFhR0x5SmFHM2RWcmdCX215MVM0R2F4cU93Q1NCeUExSi0tSmNzLXlZaHZzMFgwTy1MSjB5eTJxN05hMm1MNmo3YnpsMDR4N2VQYnh1RVVUQW5TeDVqQ1NYRGNGME9EcjctZ0ozUnN5RzFVRHVFczdfTHNROFJRTllpTFlSNERiWDFmZFZVU2dxSHJ3SUs0WkJXWkp6ZENscWpNRWlrQ3pZb1VjQWVTek9ZU0pNSkgtSkxwY2daS3BZZ2dDRi1yaUd4T2trcHk4N2hBVWNRaDFBNkhXYk5rbDIwR3Nza2hlLUlnSXlTWHJvbHNQM1dyUVNXWHp6cVNMd2o5TWlUUWdqOW5GZ2pwakJOZTZWbVdsTzk2VkE0QmI3Y3I0SDJBdXZIb2UxeEZtQmcwVjFIOTBxbU5Xa3hQSXJjSzZQSkJ3UGUydUwyRm9iUHVidGJ1b3ZsMFVlbk1uS29qU1R1cTVQS3NKMnAxMXRDTzFEdXg1eVJwSEw4RDMyUEdTRjZqSm5DOEc1M3l1c0JKb09uZ2s1VEd3TGhSMjBaeXItZWx0QndubVh6U0ZDMGFmOVpoME0zQ2U1M3NEOFRPMHRjVkJlcUdxT2dLR2dRamlLUjljQnV4OEZnUW1YUmowQWc2RGppLU9IeGU0TUkxNXFpUDFaWlkxc1R4WnEzcGxSOGhISk9hWVNjZ3JqYWxiR1JTeGtiMC11akdZNXBsbnlJUkcyaEpGdmNiNTA3UlUwVXpoMk0zNE5tVFhMWjAtZ0Q0S2FlMnlVTW5PYTlna1Bobl8wRWZaMHBtZDZadlVtVHpmT0gwSGtnNW5TcG05X2FiTWxTakJ0ZU1GRS1NQlNtNWNFeGNtTHZNTVczSjhTVGlWcUxCV3FFMEVQUVBOV0ZvRDNjck8zUlNrUmRwaTdOR2tqbVIyREZHeEdNRGVsNUtCOS04R3BTcy0wVXlVZks4U2FPbkZhMlJaSjMzcEZsY3JkOTFzTy1zQl9TeVpERmxEcFE0cmRXcWxPZUpRZ3ZFczZJYUpldDZJWEJXXzBmQmxOeDBocmZvMjM1bFZXc3lZcDZUVUlQSmEtU0RtTGhFTS1ILVBQNUo3ZFB2VHItWGQyRjQyajA0MXhMdE9YMkVoZEtiM21EXzlsN183THE2dkJRdjQ0TFVzNF9UemtKaDcwLTZLbnFTUVNrUlp6N0M5bG5zZW5WYVRpdkhNbTFTaFRzaldacHNFOW1yQ2UwNUpXbmExT0trM0hiSXhqdG5abG5XTmpaWTE4N0pkcVVVaWI4N3ZWRVR3MDByVmt1N25FN0pwRUpObWlpRGRmTzNwZ29KRlBiMnI5dThaOVBtVFFkWHUzWFdqdlpGVTZlMnotMnctcU9aWW1RTnZ6VzlmU1F4dFc2QWEtLU03NWhRaE1fdHliS3ViV3l3cjUyZm5hY3Zsbjd6eDBKTm5GUmJvWloxT2FlTzc2MlBleEd6ZjdIaExfS05PbTQtaVlza0libDczWEtKbk0xc0xfeUc3MDZ1LXlLM1BVNmVvTGFlZFY5TUdsZmlVUFNaVkFZYVpDNDlfX2JCNnBLZjNPUG5fdnhNb1FONGthcHBKVWREOVVleG8tUV80LTB1cWU3TnJPZjdOSEN4aEZYZHJzUm1QeU13cm5jRHZfNUNlTzZEamNiNVdJelpWdVp5bE9YX2NKTnhIaWIycnBYbGdSWHZuTzR5cnEtdk42NlpudVYwVGNzeXJhbXZONjJmNW5LYVZibGEwU1RubFBxbC1ma3ljNHJUMnZybGFhR3c5eXRMYzF5cTIxemI0Mmxxd3N5VnVVNjEwWlNyeUMyRnd0NEx1dHBZWlpiZTVpaldCWDBXVmJxWlBKRlMwR0xQVGxOcnNoUHNMUkRJWjEyeV9XSGpTdmtKR3BOU0hIc1dfN0NFX2VCX2JJMVlLc3NzNGF0VUhuN2M2U3RtaGpCUm04Q24tNFp0S0dhVm5ZOVRTMlJ5dDBjQ3R5eG5qRGVNWnl5Z3hlc2E1S25kOWJOY2N4enNRbjA4ajItSVp4YzY1bVROcW5mXzBwWERqa1hMY19WVmMwbjFjN0YtYXNQT3dpcGJZZFZ4YXNNSmJHNXd3MHA5VmRiODVWV1ZpM29DekYxWWRiQzVxM3dSREg0YVhGSGdQdlU4MnZBQ3czWU50MTJuOGdaWGZBS0JOSi1xTk82UUZGQkxUUEFEUGpYTHJNbGE1dDRRUlBmWndlWm0wSDk2UTZsa0t3c2NUVVZjZlQwYWtjV2hhT0otRWM2ZkZGQ3VFbkhJd01iSG1oa2YwQXJ0a1BOSEpJLVF5V1NYVmZTMHVaUmRwYWtHZlVwbVRXR1dzdEpBZnlvYWUtOUFNRjVkcTFLMVpUblZiUTJxTkxFLVp0NXE3YjBvdmw3SWRDZTVuRFc2MkUwdUJjSEJnTmN0UmMxekp6dVU3ZVdwaWR5cmIxSG5WNjRoZlIzNmxaVk4wNnRWMmtfMzUwV3pIc1U3a19JTWxSQ0sxOVNucExZNXN0TGFQS21KSlZYZGRVVGZiVE5teXkweXh2VnZPMzA3TS1wY1BHWkpzeVVuWkdWQy1VNXRtZ2F6V19TNUdkUjFyNkwzUi1wTDdiVzYycDN3VWkxbzFhWFQ4NzJ3bmZtUjlDZy0xc0hVOGVRU3U0c2pJU3NHOTZaWEJWYlJaU0tyZ3kxbEJaMExKMVB0a3RJY3R5SlZvTEkyQzYxSHVNTnktVmM4M2xkeS1iQjhvdEdWd296bGlOd0I2SF9mWkFyTElnRG5rUE5IbklkaEUwcnR4dklTbVpPal8wWWN2MHRmRHM2aDdGdm84TmgteDQtbllndVhfbGRZUHhQMjRJVUw1RFhPSnRMUGZsaTNfR0NIQzV3amVtOEQtc3dxNUNYZHVKOXZULUJiemNyeWhBcWRwYndsUmNRR2pEcldfbmY5Ql9CaGpTcXRMY3NwN2RxblNxbTJLanV6cE9yNTFLWGJhbHh1VzIxNm1yM1c3YkxYUVBiNTRfcGFGTTlZdk5LS2VXRThtZU5JaXRWR2hTSHVfZ2xla3hxNm1UNkd4MlpmbVhub1VwT2NFMVVmYURxZUVFalhTcFltd2M5NFdRbVROLS1OanNFVGY2Q0hJY3k5a1JyR0tvNHFQOU1oc05NSE9tYm5NWVI3STZsWFh1emo2eGhuaEN5MkpwTUZvX2pNbEFJejBaeG14ZndtaGdWemRITUNCTUFsX24zOG8ySVVydVB0cHZJU21ZdWpQeWhtZmhaZVlNSEx3NHBTclNMWU91LXUyMFJySTJvcnNMWkE3U3dMTGN0S214V2tiY1BhQXJRVlJscm1yTHRWQm14MmdHNHUxaG1vNzlPaFVQQnowT25qZ2VvMm1SLW44TUhPSDBkeUtnbUhhS2J0MkRhU2FXc3VJV3VBR0xobjFmT0J6aC1iY0VkblU2UDAxWkZ6T1FHVDJkMDhqa1E3azNRWE9WUTlBY0Y1Qm5VZ2hDcG9HdjBlSW43YlRNYVhHcE1ENmhLb2Z3YUhQcjJtVlZxQ1h5MHhFMU82RHRnd1dZUGpWdDd5amNiUTRYOU5fejVpbURxX0c2NzhGaHIzMnhOdDZMNFNzQUJKNGtUTEZzems3M0FZdEdtNXJkeU02ZDJWTG10U29pS3pUcHpVNFM3VkdqWEZxdHlPc25XcWRiQVp6cDA1UXMxUkVabFBHSzNjY2lpYy1tY0lSZEIwNldjUV84YmFQYlZBcy1MN1psdHB2U3RvMURPNlhQQk9hYTRsRTVMWEZ0MmRWTk42cW5qQ180eDNrY1ZYRXNoX25malVmaGNmOWkwMTlPbXJ6R3hOZUdtWWVNdElacUlkYlhXMVNscmRyV2FWZVNSTGFLWko2aVd3Q1B6UUIzc292YTdlZXlSNklGbE9tUDVwQ1BxcjhpWGVROWtUSS12M0trV3hLX0Z3NmU4WG1vZDM0a24wQ2RidFBoWE4xRkFobWc1bEJXb0RweGVwSTdZT1VhV0xJdDhwRmhicGMwTy01VzhqaWpoaXh6cmRtdFUxSUlZdWs4OHJkTFZWSEFvTF9OVXlnalJ0NnFONFpSSG41c3Zoci1QbFd5VjBMeWZiUmpBc1dQZFVJMHB3RkpSVjk3bTNkODNybWV4cWNJVWJGcTZ0SlpkVW1tUkNwMXNFdHlUZFNYbTR1R3Q1WTlCcjNhcHVDUWdhUzBwRUtYUUZaS0l4YzFFdWZWUWRjZmdVVmFsTmhFd1Bua2tNdnVwRWlWSS1zVExmRERXcmVGWXVtVG90MG90bkRPTTFEbDRteXFnWlhnVlhWb3RXZ3dtZk04bVp2cWJXaXpEX2hVNnFtbEVxeVk0N3Z5Q21qcXViMlhld3YxbV9ydHVSbzNmVmR2cTBkbU5Obm9td0drODYteWZKMGw4ZEZERWMzbG5uWVk4M2lTVGhwN3BUbnJwNnM3TlpGVEtacGlaZHVhSjdPbTl0cHI2R2VQR1pfYUdtbndJMWZkWEUtQTYtUGJHVmx0UThtSGlCYWVGeUV0VEhxdk5VYVlXWjdHTnNfWDhVZFNDRW9PZ3hYN3A0Qk0xbnltdGRqMzZzcjFUc2c1NW13cGNTYkJZc194QkpQUk9DWjU2SF9VN2NkUWlmbXExRVdpTzlyc3cyX1FENFVzcllDb1VoOGRGd2RxS2tvR3hxWFdTTUNtZk5LVXFMbTdEdDc5dTJLR2xxdHVKNGRhRlpFLXRnb3UycjhHSHRBUlVxRVFkN2N2MlZWZWxJa21hNGN1MWt4QlpGQmxiaUxCbFFEVGlSM0pMYi1OUWFtN0s1TlBsRlNoMEdaWUVoeGFEOTY0aGJLYzAyamE0dVBMYmg3bGF6c3I0OFdibzJQbGZPZHZIMkVsZUptV2ZDVk1iY1c3YkxZSWFsX0ZXUmo4WmJ4RFpESVZSZllDcTV6Q1dNbjlvSkJUbUpXaUJRTTZnREpBSnpFbkxmM2N2T2JRUGZ4djg4TzR6dzR4TUwxQWtOWmkxaDJ5aURmNS1LcVRqOFpmSkh2LXRuY2RzSl9OdkZ2VXIyVF82czl0Vzh5cXpjXzdYVTNWWDdTR1A1T2J4TWROTHRQeWtrWFFnNG80aXJBaER0UTNUaTlGLUgtdlhKTUhNLWQ5cW5KNF93RFA0UkgwVWRJT0dacTgyWExpSXJhVFFpbFVhZ1VXY2ZFWng3LU9QVHdLSHZTTkcySHdkaUM1ZU9GTlJQcXlDeVkwWHhWVTVJVE91LVdmaDdUWnJDU2JRSUIydFRJNlRqVlNYa0doa294aHBkRVVnSDUxX2dSSTUtM0RvVXlub1o5SGtacjFxdnlnMWh6ajVWNVAyVFZjVnBpYzFXMDk4b0xiZkNtTDRWVnhORlBSTk1DTzNKdl9SZGxKY1c4X3NGRlhHYjlYNVFrMWxod2hhUHVKZUw1NmptbUhjWC1TbmpfQ1FCVTR0Y3VZSjktdHZhczNzTnNXcHl1aEJlLVpqYTA2V0R2WnNsRllubjVDN1loRmpjRUxJbUhrSE12MUxNZTdweUdjYUMxZzU4N0Q4VGtVS21BTmxfaDVwT2ZKemRTUnpYemlfZnRjWFl6VVUwV2xSNVFOLXZQa2owUnptam5yMXFzOC1mcXF1ZTZaRzQ0LVZXcFRJeG40VDFtTG44ekpRMFNWR09ORkZRU0pmaEt2cFhleVdhclJwanZ0MFpxdlRSYVd4cHlYdDRTblZlUVZsNFppUTh4QmMzVFcwT1lQdWFVTE9sUUJ0XzV0aFFxRE04SWJWY2xkaVc1VWhxTDB0TjBTUVpzcjB0cUVObmg4MHZaeXJzbUxTV2kzemxmTldsNnFwdDBfY1N5azdqSnlQejNjaDhfT1NJWDhKaUk2Sml3ekJFVkVRczdPa1BUYVRyRzFUeHZJNWpSUjBIdGQ1WFdsTnlZU3BlQWREbUstZFFkYjZaeF9DaXZLV0ZYNlZHUmZOVEZMbnduUU5UTHNOTXN4VjdNZEtPbDlrQkZKWUxEejJzanhDeEhUNVc2cVU4bFI0TnlfUDMyR3F6UWpmOEdiMXFEeW5hclpTMFRFX3ZDWHZRRkZ1a1RZQlVrOF9QNWFyWHMyNm40aXR1Ymp3Wk9IdTFkbTNqdk1ZOWhSUjhIUk5mcVNaNExXM053bGN6aVcxVFpqOG5zakpWYjU5WHRMeV81NURFNGl0aWY1czRkbzR3UHZYUWZLbFpmcFl0bndrS0tVOVJsb1REVFJGZmp6SFNwbWE2LVlOLVdnOHBwNmJTSmJkeXQzNWlmb3hWSktsbEpLZmtvR1NidlRtNlQ3SVVRYWYzNmNacldKZ0o1a254UjBXS296THBFeXZUZ3FWWTR5M1lSM2YtaDd5UG1vOW1yam5GekRNX2Nic2VGejhaenNEOFhfa2JzNWgyQzVLOFdKQ3FDQTQzZzJ0N1JvSVoyelZaVlV4WG1ZdlNrdEo4OHlhNzg3Z3ZERTBuRzJ4aURaM0swTmlVZFNmaGJnZUhwd3pZanEwSlpRbE5URFhLSEdlUGpFdVBmVy1PZmEtSmpET05pMVB4TlBIQ0FyWXdrU1ZzeGdpVGdEcTVYOTJ0LVpqX3hLOHVNYUFPYmpTYjNSVkZpUUtIaGNlTnY5ZURPbVA3SkgwNm95NlRiOGNPS2d2Um5HV1doTjgzOXJSSGNsVTZhV3FDb1cyUHBGWUNyc2taNDh5WUtpUGVqRTZhYkd0VmtOVW1Ucm8zLUgyOU5uZkNNWVpvMnpSMjdvdUJyX3pBLTZycXBCZmhiWG42M3FlR3lBUTZsZEZJdC00SDNOOVY5MHFkOGlYbFM5b1BsQWRXcDNoV0dubkxpSVhpV0dmdTBzbmRPVXR0VVpUaHZkV0dJd0VIczMycklJQnRqZHNXdHI0OWs2ZkR1TTliaGFmNGV1eDQ1eFA2dURGT0xGeF84S0tGbjJndGRocWo0TGR5eVJMSmQtcWJZdkl0WGlTclhjWXhNTThab0lRUG9jMGV0WGRGdG1KWnhaS3VnNTZBU2xsWm41RzNMSUI2NkZqZzRQT2k5NE1tMFI5VnB3NjE2aGRfOEJfYjg4SDBYbWN5dTVKVjlfaDZiTnZtN0hpdFNkOHRXZllkMGFpWGFGR0xNMWNkOEJWYWV2UTl0T1B4Z3NQMVNNMVpISjVIT3V6ZXRjbkpQVnhzM3VUaUhTNGFPVm9RcnpMSmZMRmpRM0JybUx1b1piTU1MdjR3U3llZnBUTnpuZjVfU0gxQWRPcWZxWmRYeGR4c0JYVF93Y1ZMaF9nR3RFWjg0TkxZUUhKQUFxN1BNbmhtTERXRGIwWlZrOUk5Y1VtWjZlcmtiQTh6alpONlRuenVNeDNEbktuVEdESVR6UXo0eXUtUGZaclpScWxmV0FSTFl5OU5LOHJCM0VNcl9rWmJEcVlIZHJxcTBwSXpNaTFsdFllTE11T015ZkgwZlVHNGVWb1dFSWMyclZ1ejVETUlPclcyZldUcEROdTVydkUxMVpuUndrZGdRMTdiWXVlOGk2aHJQTll3dEg2WlhEYy1kN3FTbTRzeE1La2o4bV8tSFJ6YUdGSVpMclRKME5MVG9aRFE0bUJQMkNUQk1oZzU5OEh2SWFRVm9nNjJYQ000VFl6dG8tbmd5TlV3TnpfWlB4bDZEaHNySEZSeUxaLWhIOGRLV3Y0dEktYlE4aVFXbWFIWDh1RUhvOEhtb2pwdjhIZzNuRlNYd1FZVzJvTXcya01hdFJUMkFNN1JpRFNxbFVha3RneGxsdEN2S1pTdlF5V0t0TDkwUENVVEhJT2FjNVN2VnZtWGRQRy1VTXItVTZINzNfTXY4YnVfQXJwcWZ0ZExFcy1KR25SZ0VmTjVPaTdRdi1pWjhKekVjdUtXcXhFem04blRjb0FyX1p6SF9WeXFuc3JsZlU2bUlaR1JRS1BCOGJVSWZNV3RZSE1xdUp3MkRydHREdmwtZVBoOWN1amw0M3N2Z3pSeE1HZl9mbW5fNzduN040THkyXzZpdFRNVVMwNTdnSjJLWlM3aW5jRDk0WFZERVRibnlmUVRrSHR6NHAwX3lXUnBMRVh0blJETGNfTUVfMTBvbWJLTFZ5aVAxTExLNkNfbmxWbEplMGxrZnN0Q01tbWh2cE9WM1k1NF81SFdqNVRGT0xZZWFzNlI5QWJ5dXRHNWpueE5kbU5HNlFTZDk5X1ptTjBldDJDV2hacU9PVHZMNnBCLWVfSWxsMk91eHBZbVhiODlkVV96NUpLM2lfQ2ljZHR2RDVPdUVCS0UwU3R1MThSY0xDbTZYR2JHNXZ6eTR2cFpjNVRXRHFpN0ZqZHBxaXp6OTFnd3p2MzUta1hkeW10ZnFuMFdyZ2F1QXdTSWFhclZpeVQ0N2k3QVBZQ2pSd0liZDQ0b0lvOGtUZzYtOElKR2dOQUJSZ2dSQ3FZbGtzR2FDMEM4ZEVGa0RCb1JpZERNVjQxREl2UFdVbzBWbDloekJNQkhvc1ZYUzZTTU5VY0dybHpneFU5cnhNQ0lzZmhyQzNQWk0zQkJOUHl5VW13RXYxVXpNWUtFcUNYMDZJckVSQWZ3b1VHcW9xUTVwbGw2bWxrQlNZQ1dTQ05Ca3BkbUMxUlVNNGs1RjEwUmF4MVFSNGtSSk9oLWo5Z0tEN2dnV3ZCQ0lySVF2MVVXY1dIUUZWRjBZSlpoTDhKcWxZS01oR3BvWWMxRmo1QmdyblZRQUkxc1ZzVVRneDRoM3ZWS2pFWVFpcmFJbGoxSDd2R0FDOV93QmRfaFNrSTFSeGF5WkkyV1VEV0hSNnk1eGFBUm50UTdnRFdhcHlxTnVEQm9STUpCRXFZZGd1ZUFMSjlyZ1d5R2szQ2RFT01JSVd5SjBBSUpZY1VacVMxU3diLWdFYUdBSkVwbnhKY2RCeVNKWGd4d0NjUkc5eXU0QUZZY09IR0dFMGFrRVJhSUkwVG9BRXdZaDlPeU05TzE4VzU4cm9aVGQ3ZWFKbkZ6S2tLQ3dnZ3F4cWtQeW1saUtObkJXbzZIRWxWWUFUQWV5eEdTeDYydGhFQVNyd1d5bDlNSUlydUVxUVhDWXNaWlY0UlNUeExDTUNLTGd4R2lnb1NMYXdDckdsamxQbWVFT250WjRld1ZjQTF6RU90a1FVZk8xSzN5RGh3Y0k3a3RyYXdtWk55RjVLOVFaY1ZaRC1GUHJ2V2tBQnBQc25jVjlKQU5LWUFySTVNMXpZUnZKcnRBN0Rod2xfdWMtWnJQLVJhWEl0QU1xV1BCQ2swUmFnYlBXWEdLRUZrQVdMMHRNUU1SYVFIM09IUFNDRGNiNUlKR3pINklIWlVmcWJKVWZrXzc0UC05LXlObDZtWHlOUk9hSHRUTld2MWdYVHpxem9XNmphbGM2ZXY0ejhldnZnV292WUhEZ1NkcllQN0djZ3hyUUVGdDBUUlkxclR6QmIyRU5pN1BVQWhxLTVaM2pyeWllc2xHVlVSN09JeXdGM0pkYzM4N28wd195Q1ZMSUhJaUJ0UXhaVF9JLXhRSU5GaEU3bDdON0hjejJ3TVlZZkZ5aDYyMXFXNTJGRFFmSV91MlVhUnJkZmpIODF1UUF6cGpfa0JXUldtc3dMTXRud2ZJeG0yZkY4aUdiVUVmbFNjMkk2aDBZNGhjNkFCNXBUMnlHQ0ZXUVBkdzU0d2w3R21RRXVyMlhLQ1FqMDFyeXg0dFZOaVg5NEpBUVdjQ0h5Ym94LTdxcG5FMHdaN2wyVnVySGE2dDJ3UFlDX2t5eG9nM1RjRjNWal9PSFpYSENBVkdiM2RRdFVuYTluTGg0NUVnXzhZRE9Ybm5RRlV2c01pU2VhTksyQm1nd1lMeGFJSWRpekdFSHljMmhBcnE3X2JBZUs1Z19rSGVvMG5BT0FVbjc1eDktNm9YZFdVR0FjWi1hZ19zVHQ0NTNGVzlUa0pfRHVkbzlRR1hCa2NwNTlYOUppWXg3eXpmMXhCRWNpRTZjemlnci01Z2RHaUFhT2lmR2dLTHBDak95Vk5DSHk1OWZFQTB5SUZkVFRDVUIwM2tmWFVIbHpDQTBlWDdPRUhlNkFtZHc4SHZKQnE2WDU2TFFYYXBYLVkxU0hCOWN6UElSalU2TjRKc1hKY09Od21hZDNJenlJamVtRVJXTkkwS2hxN2tiRGJhdVRUZTYzcW52emZPNjl4aUZEVWotTkJMbmFCLWFtTFpWQU1VWTJ1ZS1hMFJrY0NQT2t6SmdpNnJ4MXJrNG5SUVQ5ZFhlZTEtVW4zQVc0dzJMLVZPLXZLLUJ1eFd2THlKRUQ1STZjVTZrSnRydEN3LW93Wm8wM2JLTF9aVTM3eVk3bm9lZVc3TW5IeFctdXFPSDNWUWVTWnQtd0hoSm8xS1E2dklRVlVMOEpDTTRnSW5MMldzR0J1dVg5Q0hTX0o0OTVfMUZtMmpXenNLc01FOEVSc2FxR2VhMkZkM1ZqLU1NQjA1MjhTLXV0TTIwSnVSdm5xei1pX29JSTgwc2E5RzNVRG5NRWlWaklEME1vd3plX3pLODdfTlZPTHNWZEhaTktkMGszcG1lUWhRcV9YOFg2X3o1WmZ5bTBEUmZ3RnZubjVnRWZEZUJhMkt2OU9fbjVXdFBRUTBIRUJBdl9sX0NsWS1HcEpPYnd6eFpJWnpZaTFWWUFqVTF0Q3lLU3dWV2RWeWFpQVU1aEd2dDZVbFZlSVR2SUZlT3ZBUm5fOGwwWHktTGlZcHNpb1pLem9VdDJnaXEwZGVoNkRteW96VlpnUjVRMVljemd3UkZvOG9Ud2d6VGpSYkJjV1lRYThZdko3UDhaalRHRGc3bGJQaUlLSjFQbWVLRUxsVFpKeG9TRzZ0WWJUOGhwQzk2UDVqMGw2dDROdTFpa1RIWXhFZHhPTHE0Wjh1SnI0Wk9ISXhDWnFaQTQwZXhvalAySXRVWllGVm93engwa0dtTXUyYUVZNzlLZlRNR0FYLW0zZTV5M1NnNXRPLUdLRlFZcl9NNHNTRjRnWTJLdXF4S1p6MEhubG9KUnNUQjlqSUdJT05Va3lRbnFYMlVWYTNGSUJITFNidDFjR1VYWXJCZHhUbGNkVFJoVlFxVWZIb3FKb0RHMkZqc05HT2hWUmZyLVlCVVVuUHd0UklTM2VPdjQ0aWpJRXBmaEFOTmJfVUdLOHk5b2VWRUNxZUVfbjVrYXk0cm8xQS1peVpBWjB4QWhTdTZtb3VMVHlqWnM4VVRvd1RMUjAzcl9IRnNZYlI2S3diNDNqM29tZFhYS2FwRHhsS251eUotTXdTNVEzMWZIVDJsb1phVGM4Wmlqd1ZnbEtSSE9FbF84cVRlLWxyVlloVXFoU1pVYUFhUXl2Q1AtdFJ3TFNadXptbjJrQkJ4dEpDdzhqZDJlN3J1QTV0bjYyMjJWRHN2dGhPdkNyaG5ObTY1eDh2Qk9RNlN4RFU4SUY0RXJtQUFpc0RFbHBsNGRmLXVTaHI5UkRSaWF5SEU1Q0FlaWliSHd0ajBucGVxcFRXODk0ZXpNaTRHMEZ3a1U2Uk9wNlNLTEtEUjd0Nm0zZGFOcUVPM3FRM2JhdDJ0VVFjakd4Y1duVnA1MUhOcFVLTERsbmF0Ukp3cWxhclM1TUs3WEpWYXplYjlWWXRHS1NFeEdUa1ZPcTA2dVFSOEFrZEpGekk1WXNsVTJsV29WRzFtTmVnX1NUVlJseE9QZ1U1U2NsNjYtZVhocDZXZzhvclZYTkhMOFlnMEZ0bE1DNVZ4cVhZNjBxSWZYZGtFRlJSa2staktxaFc2dm5reGpzdDBXd1N5dERDazZ3WXowU0ZoRmUxNHRoZEVST2ZkUlNxTUJWQ0E5NGNDWEx3TWJxMlhxYzZqQUNpSTNWMWdxa3dKb3c2ZVNZcnpaNUcydnFLcHQxYWx4RE9rN09iZXhfLVFaYnJnRFlRajRtRmpZT0xoMDlBU0VSTVFpcUJuRUtpSkVvcFV1a1pHSm1ZWmJDd3NySEw1SkFsbTVOTGpseDU4aFVxMXIwWjhtQ1lscDNCaWNQcGN2ZXJ0WF9XNF9VQklBUWpLSVlUSkVYSHRMRWNqeThRaXNRU2FVSzdYS0ZVcVRWYW5kNWdOSmt6QUt2TjduQzYzQjZ2RDZ1bXJxR3BwYTJqcTZkdllHaGtiSklGbXBsYldGcFoyOWphMlRzNE9qbTd3SzRJRHVBSlJCS1pRcVhSMl9IbXhtQ3ljaUFjYmo2Y0x4Q0t4QkpwQ19oeVFpTGlLbU5vOUhFeWNncEtkRDgxRFMwZFBRTWpFM1BjTkNzYk80ZDNGQ2NYTnc4dkgzOGZDRUVoWVJGUk1YRUpTU25wVEtTc25MeUNvcEt5aXFxYXVvYW1scmFPcmg0S2pjSGk4QVFpS1p0TW9kTG9EQ2FMemVIeS1BS2hTQ3lSeXVRS3BVcXQwZXIwQnFQSmJMSGFjdTBPcHh3QUlSaEJzYWFOUm53U3BFS3A4bmdnWkVYVmRNTzBiTWYxZkFBUkpwUnhJWlUyMW5sLUVFWnhrbVo1VVZaMW8ybV9ObGJEeEtRNllxOG11TUE0dXZTR2F6TXNGYWdPU3BGN1hfNEx2SGVoMnFIdFNIalA5elBweGpicXZ3VzhfTjlXbUlOU25hTTJKZ1IwR3pVSU5xa3UzbElMck5iWmkwb1RzMmxxODlPVm15dWw1dlljMDN5VVp2cm8wTGdldjE5bHRQMUlPOXRzakFqdS1jcHB2djByZVhUVVZxTENfNnVYemhXYnFHdExLZ2RNMTZuTnJYbnREUFpqdnF6UnM4dGF5azRkRTk4VkdPQnhZQU1hT0xMaVlfMHk0S2g5MVhndm9jWE5HWmE1UVREYXBzMmdHZXY3MjNhaVloV09iY2JiZUdkV3EyT3hONFZrejlGVTdDVGxOcHFZczZyMEduYlV0SGFubXBzR3M1MWhscUliNG1HMXVzcC0yd3ZhbWF0ZkxNX1R5dldNMXhDR3M4a05OZk9PeDRzRmg2eVN6ZEwzVXl3OXQ1c0d5XzdwY3NES3k4WG41ZmZfZjYyNnpFR1pvempaN0NmU1hMckxMOEJ6dFA3VEJEY0JyWGZRc181YlhITVNfTkZhUzJncmZiRzhIYldoT081LWNYNDJfbUJudTFMYWZaRnRIa3FsSzU4cmo0c2hxU2JIRkFkLWdsZjQ5R0Z3RUdZcmIxa240TEFQNGlFLWptWnZYb0RORkZ4MVliSTlBQVFCemczckVBS0ZHZ2JoWnh6aVJCdDFhWmpvRjlGSVBtbC1UX3NoWnQ1RHh1RU5fVkotYklMOXA5QnRFcVJPU0ZsZGVsTFhkNnBuNFpyUTVucWhpRzhNLWpxdlNkQXhGSl9Qa1U1LWVrTjA5bTRpTUhUTlY2TVFOOHl2bFA3cVlMcEpYbi13OWpVTHpaNjZZQVZiWEJMOHhtQ3ZkUnFtMmRhOVM2Y3BCd2ZIT0dXbm1vTmdCTlZjVDJTNTJJR3RPRGw0cTk5NFhrODhFd1FIWEw3NW5mcUhNRENFalE1S1R4TjdLcHRpZjN1TE5HLVZ1T09QdlVYLTgwdmZrcjdfaDBsTjdmY3EyTmdNbmxUSjNPVEN4eXlERzFpdWZYMDFYN2p0cm5EbkdqbUVvS1Nwb1RyREhlV2RJX2IyaU9mOGdQdjUxd0FGSVNGWUdCSEJ4SEJ4UW9LVXBLUm9hVlpsT1dKZzFvTlFUZ2Riak1OTEVsMl9hMWtPOXdYZTZaOWU4WXVzMUNF) format('woff2');
    unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
    
    /* latin */
    @font-face {
    font-family: 'Source Sans Pro';
    font-style: normal;
    font-weight: 400;
    src: local('Source Sans Pro'), url(data:font/woff2;base64,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) format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    
    /* latin-ext */
    @font-face {
    font-family: 'EB Garamond';
    font-style: normal;
    font-weight: 400;
    src: local('EB Garamond'), url(data:font/woff2;base64,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) format('woff2');
    unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
    
    /* latin */
    @font-face {
    font-family: 'EB Garamond';
    font-style: normal;
    font-weight: 400;
    src: local('EB Garamond'), url(data:font/woff2;base64,d09GMgABAAAAAFAgABAAAAAAv+wAAE/AAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGkAbsjIchHAGYD9TVEFUSACFJhEICoKqfIHpVguEZAABNgIkA4k2BCAFhGgHIAwHG8ybsxGVxwFQleUpGMea8DiSQ7FkZCDYOEBg+hcq/s8JcozRRnWAWuW/CBFRCjBK6T1ac6FRi7ssVWQAwUO+edbHBZqN33pJLL2G5QzRPkiGWAW14u/A/BGxZ3qjFtbeEfqfswiMW/ioOfUSfD/2vz33vS9iuCRIeBNPJo1EYmhkkmaX6JJUoybTOzy/Nt+Pvut/kVxz5BVRSh1HtlSbSGtj1HQCKuYcVk4xenPOnDY6a6G9KKOW/D/9fo+ufV6ZZJTtVElwAOwcSgEkdF3yL1F0m933FBPIKwnUE/srcH8q6Dan/5AkEAEn68OPszeLR24+JziUdM1ppX4idfs0DUKo4vwZMbEJEtAM6VZBu9vCcv/finXmRfW1SfdNGVpoZzKTBDsuYoiFSRyxBHySLKytkColkC/jMsSG2MB/r77yonsx7X85Wo/3+bPNgO8+utmZTT544lD+Q1utI//OMS0aKmrqU4npyU8QcyjgWF2m4In9gX9ECI3O6kdTl983V+2B2jnJJBQqfn6hMz2HbMkmttr+qgrscsLLoA7I0dScfuzHFoFV4NYhG1HlJks0IA78n6lmO8PVUksq4pwifL4U6Csaic5tCLFyuftnNszMLrnYBUhiF2AAFRCoMwFIeicoYQGCWoGSHBLlEFPFcIEOIZWxirmyO1ediy6F6p5Ld+5qt5WbzmXrtjTxz9+n+ifZH2jo4gewbF1OVw7gw2Iw2GWzmpbnqxs3B/QIP3ixtEAHGC7HOSwHz9fa8ufNR3xPQmRImtq1rMjeYs0kkpgLidIoITJwv0/Nev8iC+j4gE7PTs+ymiKayr7Af++qctk2qqAOms42K5NpFQ54xsNNbOBra8gmoj59G7eQwbzHCCPC3kbPe9q4tvftESEiIk1Coh3t/1MxlwHZBVJ74OD2Az7G1DKge0hkTDnkGGrz3+4P97adW/+91aloDEoC3VsAqpXqhATx4ZvZ3zCQGKkg6bJBcjWBjDYGZJxJIFNMA4EAlbQskGlnWh7QvTqhZTTQvVHVNhboQGvulrFAAMLDAohu+8NEngAb6KeoTVDAanH83XcfBG8Nbz1vP+8U7zzvBp/D1/JnjUQMv5zNio6/Bsm/BIB/r/evxyII4z/gvxY4Xf7PFuDOBAD0Gg9OCwQCJzZdRyowibCaOecHHycoFUwULBU8E5qE20V20UjRPNFmMSqu1n8RB1itRC6xSGrlQ30PBfnP8fo8e5LkjMgQzc5DMzR5r/PREmVMtZ7HrntdBkHqbssKLO2MTW23M57xbZtbv9457BPEM1R7Z7qT7tcRmGd7gxO6HvIpBVB8QWzDwiMWMiqKqglz7EskeJ8IZUTYQWrr7x/iHIClE2cRREdIE1g32jQLTnmvj9me6l2LMqQZbqYJ9kDGQGD67WZaz/j1BS35cka9Oy41bnZcWPP9exggNPEwTX0GZxGKQEspk3HcfPzfhvHFaMXnrp79em/QRtvJEhhAMuR5vKCdK9hSu3YYnnsETaH+rUVjfc03Iuv1JL/0HunV87elBz/73S360L/78MREWuPNMAXZ0smbNFqbu89MHWjbn0L230nIHt5MMmaac+nuNsHOyDaQ8XQCOP/XeBYJ91C1m/td9O5ttycg27qjW0vfUzkIq04WDNIfY8o/W/LqeFqTrzdKGIXvHavufMFPiW4leFeY5msLuQ7xf8XpJgoQAtBEjKCmRfLhi+HPH1egQDxBwvBFiMSKkUIq3Qh6pUrZlBvDbpyJYkw2TZpu3bKcd162Sy7JccV1uW66pdBddxW7774RnnmuxE9+UhY6apSHH/WqQX4EFF0F3AW8A6IOUHAN8BCIekBEHSAh5hWd7poQBUAF0AB0AAPABLAAcZAASZACaZAFuX7okzhAbAUeYNmXOSsTPkdu0Kmi3HaxMjyHEW8MiyT5ADiYnA0TDNuwLo1ze2EezMjjunLMljTxCYQildBIGPVs0X4jgnLuOVRHNABkRLwCEFjbuyrunTFBaQUkEzQFkE3nzMrGlAXtRsdQ+C+YgvUEBYJbhUbCEmE6QUfypNHvoINuAPOKv5zISW5hqA0NHQMTq4KhIMF/Q5rre0KR6veAB3n07mMsQmkZFQ0dAxNLsOJtSPRkKHRLGtnkKpb/4NsKAoXBESIrJlVRVVPX0NTS0dUzMLRm3YaRsYmpmbmFpauxxQHwyFlY2dg5OLm4+fZxxVbCIqJ3seBXmXdVqXzCEmGSLwV3/T7WoeoCPHvJu81UXvO8fIXOz77HM2s+l+YrOEjOg82Jx4JbD2lDyiZNskSWIBQ6Y/ySJHetW3oGhtas2zAyNjE1M7ewdPVZ1dKxsBAAZpZVGzv2kCebZ3mp9zZ8fFy0lT4T3EyfMFn8jKNBU9rre6cH3aZnYGjNug0jYxNTM3MLS1fjokVgCBQGRxTdNR45CysbOwcnFzdfcneitl5OVKSqpq6hqVWdNnT1DAytWbdh16kz50bGJqZm5haWLly5dnMzt9/JQuaV69k902YjS/Fhkld059mVExTvk8CoEsDw5VNRb2SPpPdYBZpN1PTmdbXNXc46Z4IhQyZ54Gnd8NQaAoJcUNQfCRqDh4MLwiOCvrHfUiwpI6FEUpFTU9BQ0k4qXnT49LxBrAPKh5ofiD+NAFqBkxcbF0qQYBwhI3VChREIpxeBIxIiCmRYUmJ4YBLhkhKWLIVQaok+Fb5xOeDKZZCHUcqk7BEpV+l7lQawRhLXZCTYKGajWYzhbWwatetA6EwfXSYiTGYpc00xFREyXGixLh+a5SMZsceG9cSIPX2zYJ7wQZEACSLiOHAQIJGeNKCokQl0skLe+bJQyCBAyFGAw0VphfHCBQURXBLjYEW9TGWZtqwGgeHjdeDIx5AKZgmFRiCVlHVKleFELYQ0LpswhJGWA8AQGA984yibNWtDxQ6D5SAwCesdPvwDYxqOhM/zLhC5SH5TQutywuC6UE0la/INCZ47CZ57J8GbkxvKKP2XTeQCqVFqXDwa9T+tvRsw8WtqqAKz3hhXMxosqKUeqV9acxvr3xnbPgZs/aC0G9dCZSebRfVSa2y0m0/+oM+dNQg4Dpt8JegcfyUnT+fStIR8nW9nxJob/rogJ/Xd/wMowOAIQOCgBCRIgiVEQiXaYUTOnnv5oHx0+DCL8T3JfmezfMW5hM7X5uh8Jv9PhAQyS1g3OA+GDIYOhkn46rCRUJGiDDP5woaIiBUoQ+r51n3zh5h+IRKQSqc5FFFO4zy5nFWQSJu3iSy0yCPYnEsU+apHmTjleK7YNGuPVeTX0lDiFLiy3T6gvd5+J6630LJEv08/vBIcLDUDqxkQOfLNPJNlusFslhL5Zqs+AYHeM5rq64EBaeOKANPxdcdSTn8q9oZ3mfAaPOTrwZwnoRacBPK/1x+3b4BiW3PuAGgHQGzaAkAfLAiEBAOawYAB4HVvYxsEgJ9A50NMFIJdn4EpIjYB6RyEeRYc1YD5BoooBNQk0LSlMkUMTPKbuIZNuKn+hxzl9vjO7t6+vQPrHtY9qntOp9RpdQadRefSRejcug90P1kM+l7LEqvIIPnv///vnf8B1NCxizCQo5weMzrzWZ1cp74bnLrwL1x2TwCLAbIZ+L94+dQpfn3w7MHTB18DwNvj/xv/fz+6z/6nPkh/kPjD7z90/tDx/Y/fv4BepRgYT3iHFnoExHbwcMSmlvp0P7noZze8DSyq/OKWb1z3wTn3nTW0vb6+/wf/+s/loEEoNA4eMZaElIqahpYXPR9+/AUIZBMkWIhQ4e666V4gfgiDGEmSpUqXI1eefCUb+cByFao0GUU4xrgF/7ezQ6cuk9wO1p2A/OaS1955431I4kafeBZ4FrBvgx+DEwbARSfDGBrVrobV5z7y3GlfOeMKDAxBQOFIDBE+ASElGTkFLh0zAyNvJn+zcLFzcArjayy3WHE84iVIlCJbhkxZRihUpFiaSnWq1WhQ6x/12ozXotUEI01k1eiJpx545LGHIFD+Hx8gxgKklUD0A8b+CDDuZQCKt4DCTgAJnEsCksk4MajRGQE9RUkjN5lsgHDImArb2hjMhnM4rDc9XA8Bx2A+DXJEQa+iLjZDqEFrn1EfLbIZgDkAtTPALKYRTdSbyWBYgp+WcC5Gv2hoegxGh5ZPBgICGK0piBZzONPOJKLzMQdykNpGjY31IMLusDY6Wyow0yxQLOqoRCj5c+mVvHCRMCxQJFy7TdLWWtcWJAmydyfNmcyKJAOJP2BdW0IaP0iQJ4wvTZIkJe+c2VjXUBQtNg8kn10iFoYI/KPnpMgkMIPka6e6+IbSQHOgPHCy7aMyIWseSI6En0yyLEk2jHWHNISWmcvkZVmtU8sz/VIrhampXXwBu4QxAqFA4GRFjrSk8piIIKtYGC0Q2qOj7bwQLdfbIOBpOSKOUsr5YPsaAncWyuN5e7vdOp2Q/0JK7Ps9pKwLoSIFJQzDy13oz3fyORw+X6Xy45tl0iqeKDBwhKRcyI+JVrLBLMsmcgUcqUiEcgLlHI6cx/HjKywcuZnD4Ug0HJ6fiUG4cDUX4ZjfrYhFFCncffM5y5IqiCpSV9UNQ/OXNaSDvY1wBgFQWu++Sm2dKNdcNpDuP5GwqiUgNFQBdnjRR4dr+NDXs60UYbkdP/nKoADeluU6M/H4T6WoU64WRi74Xw/D5qmH/ZVmmViznpOiyVmLBprodYCDmn/3Mc9iqZYiBNSZRzXTCusoxKB5jfhqnfOaEsDtae8qHV1uIIoMF3QsYGXMQUWTb/jVsovU3HufoBYodJOhIv1hyD2tVKbfkxsWil49r+bD1kmBIUENgTHZ4bINootQSkWda7ruJWcPHD9iiaEqbFUD2Zk1zNjfrrzZRdN8BLcLm0cvu770HgYFHhon6gxKuRVIVf9u87TWQWOWAGiBLpNNUu4IFF02sIyuI5a83TNVuRWggtCHBOGgdROK/3d2dKC7ieZrExZQc3xjuK96dWXzuCNH/+dTOghIqiqe4Tz4gIqpodbbXo8501YgPY4DvWDezwHGv2v62KcVY2O7/o3rOrsH4+YcaMA2ZAATADXPNRhRtF/PbVXKV1UjAJAqo56beZ5cSLAofFSRuDZwYHI53oFQQ8LXASLMZOGYWL5QQ5XZBpqvIAGRUtWGDY8QJy2AkHygppYmxATfs0Qg5FphGFowPbizm2LReRVixkT8efTnCw0omptpb4IsVYSNR1RVx0L49mFrsbjuRlFXbAomt4wsMXsk+GTBETic6j/5uRmrkZGVDA/PSo5Ux2N1D70RlGT68aD9gYZJe763WEXI+wmihpH8edhPQgMr158IyncqrbQin4ZLhaqkPKqWYFLh9GY5TO3TSEpcXcQXInTzvIP3AOIbutIYtvClC/tYb8U69BCdYLDvf37zaiIVcisiKiBZxMYMWqUZuMNQ7iVtsYWSOoJIwHB7EspoSsmRcAfMaCAEUAeA3/s1gmjMdwlOqr5rbJMlQ++O53gA4GWNzIAIb88ZNrhw9ols6nVuZ3mPF63Kun2woOW+E9TVNfDcieTUCgl60xSdUq1PTz3nI/OqHdrpM2rh3XTrnMPhOMlI5ZNK8+zFfw+w6y5qXiFogmAAEADqv+B4hfLLXvvGiOfEmQAqfwUErFIVcq5VIYvyogDeXrJJDmkjPxFu0O4KPaDhgjT29YTP2vCzvmsWW8tqa7FuzdNQ22vK1S34O52fUH5hUnaV6w3nf0p+Dfdpe5aol0wqfj+3WADEjm3UM2kVIh2CSz+0AZrJlI5WG1UpcV11Y7Pm/vBwpcxSaxKW425QgA9NyeaTZYIXWtMfiFniVbwHmefu0P0NsPgMrjrl4JUbh6t3p1lk1ZJY4FEt30UlaTsJ0tEMz3R3Ym009S6FO4MHNVi89DiA2q28CwkIk2SUFw066YMJJhPf7ScLWg2WiTfbwOzUtH8o9odzyp5jL8Ndppq6Ft+Ng8hQvbkZAutSAjiDXyPzSzZcH8rBVr4KOsAgf5mL8vyQmwajWAPOZTn8nAInI0yny1lxPsFIXkJ8MddIl+Pm5gxDSQYL0mHLrNAODNOKqoXZuqnD5g4jWW4vRnj1TVaUa3QfOIuvfi5jXAJohlIO4B46m3ybX+HyYHsq8C9jqfFgkv+DpzkShmUvbJO/mpRGDIDxJk+YzLdLdr23x0raEKPSUfCgrc3wUxfcH+6HL76Z0HOJ4C1vskZwplf2xBTz1jAWiZPe4dKkEgvbZLhzt1X1w1Z20BR12EiwPF2uhdKjxFOgVUG0vdBVQS2nnZgq7rNeOKULKQABNFmJ5H5OcPAaiwmQun48H2oTQGZEC7MWKrm6BNF1hbHPJnpdFM/YWuQCk6l1B/9qK7naLxUDdyKJR4/s5Og0CraDFgj9N+HqY3kVMqqS/nZCEPQlXZ5EXfjKDIXY+ICFZeHrYEAAlb2FssmMTmMYC49a2emcEfqDmcK0mvPee4g2yTuahcSEmk4FC1YogSg/7V7Zy5VaQr+C2BsC+uZ52og5uV67LmsWy9IktSUfcSCUr22x/roGpe894McSvBItP0CTYNQOuPvX9au6Zs8lsAgihOgbxexPepmztmFlxWPmcLk4Dl84qAmVDZ3EDKRJhjao92JT79JYgtrd5wxR0eTTBvLE+rb3n1+7BFhxWrJd4EWtSG6ZRPFatBHRlkTOzDt2iE5nPtLkVTAIuUthhFqADeOvOLUK/jO2g0cmuI77hBE32eR2hOTNsrTdxVMKx/KZleViET3SMPzlpEpYZZQXoXCpyIskWOVm7QHIJjHbFSzfq1j0+YiLGhhmxEOZyeAQQexW5hO2IBWq9kRpOb6p7ACKH143Yaq40iZhhcMtsDGnNsgJ+xC8viSBIKKzS2qYhxSdb/5zS8L5Fhj7Ys6DofSjtCJLksIJUGPWLw70O8aiGmQ0b5+4Rbb2ma3ZjmqYvEgiIEXzXTMJgf4vp927EaQxJuSqqALtrdff0z9U3Z2DUEfFay0ePT0SM71q+QUyCyWAyQkqeqnIB1E4yaiimdh4n1X3c0RAaJ1hU19OEpcbuWQ9ErR+eQw5EqPhkUDBogoDcrQIhxDoaY6ZhxjPH+e5RXf+RNmuxXkFy3mTL+bFQMEeiL/9AEJG5g2fMi+SFlFHCN4XQx1qrNJfbmYblsQ7WRBt1G5VK11YPxHQMDJR5HFTB7m/bUdfX7QKe4+ua80USjWqlwVQbpUW397z5gX6bQifXqVH9zk/DZVD22vkL7tEwH0Cmu2TSFVc8O6jvQEgnhGjhJhIuafkEnFyGZBYiTSn4BdWHYs7oc1k6piHyC7LnVfI/GI/B/DGxmemP8NXKkVyOdG7Ko3oqCY3nPoZwWfqp4aloAorE4K4zxWwKyu1P+lXCXjepCReh5d+53XSXXSLI4vR/X7MontvGsICRXNks76nTRFo7EMdcjeH0EoMMJ/eZpoX+5PwA9Yu43UGPXpl4vJtFl2b0pvWL1SYPUn+84X72DPtGcVZxGLP0fKZpg60bK8bdPTdm9ETmhAJTqwFDWTyuTXq5+28oWAFq2Lr8d+3WrpMDiIsMKGMvgsX0Z8ltoJpJPxuRmV+R3SnUDImUlumZjVoJu/sFhieKlXAPYxXvTlr5skHnO7nqHV7027VT3k6ClqFwBdh+P0iIQXyYZmqfEgVexIxbu06ZLx5dEkpStDwew/PpPOQySn8IMjv73VwCrAOcxuWNzst7DUAefRXO2TGnPLvr/Y32Tzzg2yxxXOZK2COnAm14cmanzEe12UlR4bSPb0rvgvPmukXdnYSwZPkEct3OWpwnvebnYi5peqhOGQ0+WnYjCaWNG0HT77clRcqPcJ2kYBQm2HtSkeCbC1oQZI4mO1pjze4BhuYaBCf2NWiiCBungnRG5ik6GtFG84Cmse5PvUzqzDbi8nkv1zjnDwxLGpj3B7Hbv5NJ7FnmT6UhKS9FIWqTOessWtVTYsgNlrJ5fUg4aDOcA/bPnWzxoKiEuSSUH7iKkgAX5BqPDLtm3eek5wNjS4LgAabAiTcJRmIPhrbvCzwoECZdy2KZ1xzlCwg0n9AWjUfR9V+EE1WdF3ZXok98E8tv9Uoo/D4W+XAse90I6ZJtSbib073mCe2GFt5NvfqJOD0zDE8JJq8VoEWSi35u+1Owu9i4IYvC7EPdTydnCF92odC1Aa/Qg/SEcPAnWCTyLVuR8e2BmZN0heAQ+p07gbZG5GtkSNVlhauMu3aUeK7zOqbONf+EnLGAtKvKNVZ0CsLPa7EvhzyaaA/j4eQYEilN1w/wLd8y6edBi+Hev/Sv9nGe1zHeWMVT+PJV9txhfUyyX+pL+I8TCm3l16o17PApFONzOC7pCoOXxhwZfkClLOY44S+UIwajj8EGbeygxpT2DZi3UOhufWfNzvIkdokGYvnYSq0MBEAI9xs3B2+vLicdVBkxmYpV5ZXauh2AG4C6O1KoxCNOhzE81EdLckuJN4TsAVsHdmVLJLesBUXr7BkCOGRNmGvrVDM3z/rFRJwquhdpuuHKcGcJUDzOQ1+dzBbSPcDXY2ae36Ts/lSrkiHmwhvrg58Ke1dfCCMnw0dITsZaJr+jM4TJIuguIdIDDQUNemNs9F7fZY/sWMlej1Dl7CdmL61pj7fITzWBN2mvZCdn1u93eotMCj7T9nxyqFc9mbXH9ALfl3va5Dh+S6hHd8+vUIjd19Bd6hjjB+r1npQ88+DkP/vt7FESZmfpbsvLG6BeyLkBko2Vsw/+ddLZbNenAje4x1G0r6A4If3umgcAX2DU/1/xzXjcR/fSsewR6zv0DBpxqBSEBdSA7rMgOHuGKXtqNVE5IpBzMoW48Gq4ELo6QW9TvEYsugNCOZrjpqlTeatPW8OqeN7HtdB8sSnwi+qixOwOTGX3XX7slR6NYsRD8xugOi+z6n2DCAk0f37ANMHKSwVgVlMux3TYD+gbJ9JU5o8H4stHn8k6s46VEyFSAszHvAHtgyyVH2VgCUQZlVPjBxqgAeM+0gQJFYAZfBZscvgN3WvOwHeB5OHeOJBSVXP9/aoD8UrH+c/Mu7AnJWDKJ3Git/FKB9D0rlA0pDzR066n0zpdS+9V8WjANnAWKZBOxLePCq5rttW/+QDSXxwqIBZAxW9i4IEOC0Ahciv8wbCBQbTbdpU9gvdtDwRPAahmLnXHFZrIZdwESL33AznCsuhZwsPxoqHSynV6RU0rA8yKsgm6bBjIPVAmsV1X5tqOmFsqjX0pIDOy7edAGWVx89ofhXRxyyx3E5JKCa5is3Bvq9iMjsct7RNjY16RdQgVTJp4mWCTc2jO0CABbnizO01fUI987c+zacBmALYL7Cp4rf/puuQLc4Yb3l0J8eWL+9KwhrVXVTmt2ItHPGGQcaXOmOQjFmFtCrOhG3rG9lJAo5lNIHP+XuwGMwAZqhinSJlwH9/mkKoE/3xGyvPM3iy/b5xkJIaKMCsga3YwPbTOugsXmy8MDvgZQ6bp+W97jIZ1DwWRZzPePrNSgtYDvRvGszS8hjSV2EKIKoqVr1SFTE1W8SjF+2Tk6/2VDBLvHNR9fkpOzM3ly9g1AvG0rLs+J4GLVByMXj33yOqerduaK/9ITr/2zmhD5xLIEyUTEPEWubvt8nzz/B2WxSrJ2il6ce3Watcn/9sDpPpt04UwfNeTvcfH4a9Ny8v9y7LGsHXm47lxirrF5oKe2riWsaYxsSvlU/NLw2jgVo8qSKteXyCTVfPATq0yErwCTNFoZ4J4MsoorKF3BhDzZUwCxuM+yzOp4+B4pkj3VCt+tcpo0iMWqrev9ztIkfh0E4iFQc5sUvbuT9/pg7SSelgXJ8aX2I90vEDhnZWx+QEzZg5k12I33MywFul0l+PkUmyT/AjKPc2JB0a+xXLDi/1VCMwjPXW7PX9golcD34xM4a+xBa4A/Ccv4t1KXF4s/foQst1nKFr0lfXFQes0HjPRDmT8p9ozKYhQoVZ0KxCTEAx2smB9/9QeK5WCuP3o+JM8PRzpIQckmfHrNyhLCT+bQWUqHyf4wB26iTJWfn4rIubxULKroTngTKisAFKMWkxB212QMVA+GkaEz2obrJInRk/lreDWqMAUqa3A6eheTsrMJprjsrgPAZX9oTK6KaLh4Ba52m0VfizdSofAC7PU+vEUfLNKEV2NkoLv7U6u+kNCu6DGsuSEx1B20leKEkukzA7y4FKr+yVjNaTx2pSBQAijfcX2AN9MjrrsvpPb+EJuuVVepwgq5FnyvJT2nLRxTtoSrOpBqpVBtA8YaUnApdHq7+RURf43CXd6VXskBPJHSUpiWn0eLYdzmwdg6R83ux2W4l3hjldxNx4KpV7rTnWx1hbLaO1fcrTLN0jptL/11hGYSP/JNAsGzMXd5Kzi8vLO5Y80jvkQzi7okx47ob54sIYkyssKWV77dIcnF45v1wRnoJWCYSDUkJAWeS48fLqA+mGoG66CZ+/9vnqytHi8mmcBao4j68iu5tWG4k0Bv2Hn/X6bab0nrwQ3B3atbx6lsCxycx+GA8LoZwp8CDUG0XtNqUXHRibmh6jsEMqcAX0LveUGM1wdVg85V4WFEnWcouNELwSxrIzIvplyAvM6qJqleda2Gv8m/XQJ96uzceuojeJbDH1Uv/j5wJHkzcV0IiZNkLjO9vhknm9d7Vc/MDb/Sy2/10SHcj07IHiRKohb4qrx1/U0+jwkHZBF6zkO9cJjbuGnNe0zbckXBb4ngQDQfuvBd96qxDVfp5BaMG3SgWTZCKH9O8Akr44/uGO0Uvj5txaAe95RxkCKyJZrL7fiQRQGLt/pdHqdruaRRZJzDZAwwz5gHsOWELNYfy5zvEwRcxya8wJlcjitG1jodqLKyQ5zxqfFgG40wIazJCMpsMbxjkv8h5La+Evp0EXh/tRNcsIiFl/nTt1oQwPSEXpIGxR+mZf3nrDnCQuCvDWXRo4BL3lnuo+XFy+uL2ztYnWti7YAy8IzqYKJaqpySxUOxMSU9xYH5G1bAE/tJJFpIKedW85VEfsHMxe5006SH9mke14hXjkMjo+WROZWKIwuqCsvbxAcR9ZwqATAgiEvV7/u7zRrJoM5DiYuq46EVPB9m8/2P1AZCQE1JlMmqFeQ44D7ct4rzx/CGOSDV97R2sCheDteYdPuiO9n5NZ2rkJcCIjMxLfGtzg4elKszLrvweBUkkNAI/SVj1+atUUHj1iMYyCbu5edi7pkxekcvJeoDz7UgyHDVfRTJr1IkndZPmJXnUjHL26QJS/d/F/TkYvnLo47/bcLXP4t/uDjdy3OEG/Xv7F6y8Cx/mM8m+Tu9Mn8WdIZs9uMAIEEvtJZKmuT+x91rZ9t9/ZXPA/BP6Ky3uZIxNbBRzuG5wI/xI9JOCfF8Z0ydbzTqBzInzu/bAMk6rbSQZ/zeUK1fpb17SreRiMwumvshE4a8RrCYytAwt2wjNrzyYGXbhIEE0HCNHCqFGaRAJv36vXWBv3dUTUxz55ZscLhoK39RTyYj0oh9aVwC6fEqgAJEBibB+amkWhszAsiI3ZWv+DUjyT3MF7RX5C6K4JriXNvb+TRlfgQMUTCjHCB6fXsfX79jz001D3OGvVfxgakdfeefcKSs15MV9S6g0FWArplwmlQ5mQn/SlSMV9jXMwz3DDDrKJv4j5NllvcU9dzJNvzjO+tZDKEIeRaZOZeOY3Ed4z97cQBBkPXo8FKZhmOmW6Hgf9RdQ/XFXaAVY8qNe0t8TlGKq3/98z30446rH1W/1DbS9S/sgWhnNdWqWj+rqPf6p3gNvPu8/rm3PNAbr59DnfhWi66pcHmzR+mtK7w31my3YrlaCf5+m21RVFTE5LHjZpVMkCZ7p3vq/88VWuNA/Hf0R8l/X3TvcIfCKqAz1Z3nWhwyztSeW1YcOTymLp0SoB2XK2fMzc1xn1XNCC026kCLay6x6puG8I8jVccDV8YulyAfyWJN5wlQ+uyQVQ/Dq6frG9uMC3JS4peEpF5ZTgXENGZ2rc7MIkW3NmWo3V5Xf6g/Zz6yE3B0RGEWNQ4mfKhc3GIAAl/8Iw8ZJ0Y1E/q0aLUv6wh7LE6oz6JOAleICmBXU/S81GW9vcvbyb1E6iRpM3Kp+DziVRRkPSgIti+PjTCoLZMiEpPGn5x5Ci2/zhr5n/mjtjYgpwas0fZZZk3J4NJUMeyKIZAMlZgsS9GfVS3Sif9ap5c8A4ELNeYNDEeekoEaCUSoKQUFgHaz+8QzhN9gkChyoVQRAZEIPHwiLpu0rxcZTSKTh8bav2cLjTOULdi5573EBQLvTa5IHfpfL6/FW1WB6XC+ZyEybbKwtDOxJSwqfVVcwKThVu/sl3aawJjSpiiYU43WutOHuisDFWbI+osLvzTKMiE/3GJaeXeTsjRs3b7q2kEIRitMaJU9pp9ANBvkcVjmyV0qVCMZqg7Pm40SwUq7Bg1rQcRf3XVc66mymK/Qy+xek3BeNMp42/FmAc/Bu+6noPKxl4qNJwiXew55HmDN6HthKcr1T7CuB3BFej0v8pFdl7VbxnudySF5rTZpvnDY2/5apu9Eok616q0K0lT+E3cbqvMBqbijGfe30rgZ8SbAEML2SSL+GM9m48bbxcgPGIN/2fMumeFwjhRHyAPZq86qdBkjkVDkVsNbgAFuRPo5hn5/TnGhzCEwx34idX07lGbV6y1fhtCA8yccy6MqOM730VyckvQ/8F++WxnjSfMl7iA65JxZV7WgBrjqE8FGMSzl3sHEuITOhtycFDNAlQN04fwAbWnKnxH3b+uCV/xwuocBvvAPKWHDmavvFq8R4D9zXObDrIxT8qGPop/2sUFWA2OE+FbtgyCy511XKfYZRF17BWf03ev2qmOUgQmcKePWpOzW2vE47Jqukr7L5fS84ReAkOwVDTtjoWTyadJVAeSIcsioeP4nGVJd7Bs97EMcXC9fQMX1KEE/blWmVN71GCNPDp7lfdNLFcFru8+pMey8uQ0ytjVtr8CZM2jhBiLwliy9PTf99acoPxoBOxZmKMVWv3t3SBklYyXu+hr7KMSXAr1gzH0T3JT2+y16SWtqJHoTNYGiUTeG3EeLdK/fT0Y3V9rFjk6AOrBVR6c1D38JTkwuTC6JT1CY39KDYcB9A0aO5w1S7PGBWVNZsXcm5VYDAxGVuVEzzmhGMnRbHYSftegYpa6Qk+G5eTWZlZGZ9zJsj1B06hPJABmmclINNg+AiB7+fSYjEl3wNpua9xHuZpl2MgvhF0dtrkFiUhOA+6uHGdgSUFwV0pbr/J+VXTwnM/JYr3m9LkeO/0uhhnW0aC14ThpWWu6NS6aFdLhkercJSVBYHNCZx9rqOiD9YSuLSaoFdO63RDUliGYlZXVyeItV+EZ+9HSleFeoJ/tt+PiYx3c0v/tPKwxWOzsmITZb4nR1ZpzhdqNLdw29GrUjWz7Awnr2VBWd4wW331sHTpaBzdhmGxbFRUTVFWWVqy2in7znQff10V1TXAxNFtsemUxpTdfK4PsDLgOHyLTEJShcJ968BQDhte6hecE5WcXNLpm0DDBEmpvHox5jiaXX10fVZhVaafKmmnzZhyUnfJ6y/w/F1SrfXFqAQn4b81eUZycFiyrnJYlCYmLWT+qLpMdjyGua6cThEXKCNEj6tje1GGpJo277k6SdjasqgjdvbjWz9qv9hDJrNq+XJ2ykF7ovePJ0ZsvdY8itqj+95VdVXQ/G+31C8+Bf1FnxTiG7GasS3ZOQHGmJITdtz0e1hufObP/cVGPsP/Pm9GWWCcjyne4sPG/xitCxOTIC9KcQRc5Pt65AddTZJ4G0scJLGlmDgtI9bPWPbM7LNeEtyY6nTE2V0B2aV2jynjbcsuWd4tOcOnCIm7008bDPlqK//2mOIcvm5nZHBRlQ3cQtHoeqmgxTQr0D6z+cYDpU3+aIPpxr8k6o3Ryd9eGi7YhKJEaPE2SaXx0NsDv3GQ4SSmR/WZKi6H6iCJdmdQl71OWlIROt/UV/CraeUWdw6PbElzmU4iJDftQ3ZKLesWSO4Ruu+WVpEVXF9uH9ZQ8XG7FCRCOZhykWCor4lg93JNKtjTy8i+gIsvLdSg+fAiyA2lJXS2xYFNmX3nhR5VWcMwhrRE7E87+PNqSf9rakwwQdUeGVsJaPEt+gsajBMK50kXTxJnW+Y1BOlePVQyCuHqdGJNLCxu73skUbz92Dl2974SOBdk8OHx4bc1RwQifclmKNRCvqkDG2xhBBNBk7nCVGQtnZdS5Z1+0tsXxaPCwxZdnWiC85cPRLKq05pPhqdyYAQS7356zZJaWTqee14GoxyVL7n5kr7gCVtEh768rTmd5BPbbklm60k21yKPHX5Z32I1kPxziBfcWCBW3NB4YG08U/keGunD0NWW1eZyQ8UEizO8y1CoH5ESvn8dUxdqLUyevHrXxKHZx2a0eaH6+VZkoWbteK47LZqzmiPgjpj22bqJIxd+fpdmMlt7Rw4NxVHu4WtiMJbWeNDtxlvmXi1NWfV95aRDyPsHHzxRtdwry4LWNfU9OSsmMxsb+kf2eObsCk7FeLOCDnIbFn1wIInL6zItZTNC2r4Ydc+slZls0JACrX2PDCkY7tmSbcEkfu10dfTCni5KvOv6vfSDsVeL8Ljz/k7o9906fFtNB3N6pZRdYViV0m8ULOqXCVKAB+i1ezTpaADAdId2OxPy2zLH5nTYEoViGGkdGMgAVk2IfvzgzbCzDOpB8QxJxObdKL0MRX1al/gpFPEGr8jpzXuwRcaoLFdC7vjUkRltgYlGEi+Oye7TGxJhfT5urpNcISgu2rH3Yph5JDBKxqnjzHm+JaFmIy78wu6bM7ACRTeQtETC8DQ8MYluWQePGS65LRFtPe1BKX6R4Czuvjx9bcDoRYnZoR0vp04iquEhDK/rK1gMk1x4cgufIJzpCg5XOZ0rq/DWAf2vKPaKzg7tt4ntYKaM3ICihQMtz6R89rbELBgaZXpBwnkIYoanjzco+mB4syn4HHeIdz7YQ+NwPorgiGARF5sYkzVMbM7ylyiuTa9sJGXSAwrXYV6PWihU94A2rih1rkgnzqjzCR2FeFFPNfy7y3OjKZRCsem/0lgeKnDbaiscrOkRhv6BJgsUR90Ilo8x2/+PEwRuQOjDf7DHt7srYQEdjsO9LXHzhMqfwfm5+OrgSV88S8YICYHzClbVYCJE9KZ1VYEWtx90WPKzq6OCV6cvM+BD3A/nafelT2fsCSnEmbti8qfQyc9/rpbIEarlG6n/fT+Ry3YsFevCMxsCw+Zz4pTv1KKEESEcFEOJqwyBhsCGln+h5Ur+shEmGMpVv1Ioc5P1gksb417f6zzjGIWG6ZdMkWpnTnJhXAaCAT/JHq6ZVS2cD6Ou9oNfLmSvHXEvFAdxVDi6/tXbGEztu3soI1V5K1aGalbpyGF3oHhiA4C50kNB+RSGb3G7UbQfo0aJnyqXhTnm4Fir/dTVadU5COxCUF/fy+KomJ+ydXpXlstWFOYObawO320Zq8lyequzz9mtR3JPGWt+ATd5zixnYFFobFhTxfCIWPgwTQ5FUVh/blaZyBE1IsVmTXX7+Wr6OoU5MMPDx054dTwd1IrguTDt5uLPYm3O8JxI/zJnRHBdbbSHnbNhBkrIP/ZZ3drNUC1HxbcclTCO4f6hAacNaxms+6SAJhZg+8oDW2MbwpRKM9inelxplq328cSH692IP3jGDStzhBZHDY9uaBo2TL46pdokPabLGrkqM6cDJeQ5M91zRgQWZt8iiNd0YLt9VG1QroHkFhxIsVx2FeqmFPurSkIz8uwBxnn6khDjc5HnIy/fbnW6r8NSFBMKbvJCs4MDqmMjgsoLw4OsP1jNXtoh3m6p3ScjIdBXi5uDnAhJi6WPVms7AkvkwpcxvrTGapTdu83S4Lt0zy64X1KCXsM6u7xvi35RHaSX4uSZ3lonq6R7/tTtwOAcIP/kWaFva3x8qloflq1kXTzqtxWXCvS2qOz8IrwGnYK1Y4TN7I23cupxPtvXVs3Fl9Lam0phdgs4pc+vjglVvuLcfzKz979Cq9UTEhQZMeO4QfprrDCuDE8yWuiBI1VZO5IEhfcY3s3VfSVosSPQ25Lyb4ZJvdviSAvXrN+tkE2f6WVcNej0SfYJdPvY7J5M7wDN7oSOQT7HSXD51Eo3olJ5I4FCyuWXn+gC1SxD1T/5DHmjki/p5lAtN0etfeuAEReCJwSH7BYEhPz96zIvR0xa5A2278n6gzjDsnF6kdARx7IMsX/Dkxb2kuL8cqlYee+fHV4XkXGVKJuxnMIhi60Gg9RGnHw63l0uuqvyWRKTgDPTu4ZfmIPhGJkRJvtROC5o/FNyB8TVsSXPzgGTIJGFyQuOCepLgqwce5HfeixjyCctT75g3xijZ3cz9Phlpb8+zUEQI0Z/FJNEYbjPthmNqxJCYIzoHiSwg7RDYH5K8Wj8znoTdDt3/Zi2fBQSQ59GxupX8rc+2WAmGda7EnaJKHx51YYPFBJi7JpXgGIEVy8UmgAb/aTlCUkYUbHoYdg9g2rsEU4+ywz4OPte45k1nqGrlpVy3zhg2ARTI92v2eNPWp6R+CPM6KoHyX0Ecabv5iX2turwEnsCPszE5v9mKAVOBCeIFB4thOtS/CNM/71B/sn2dugPjTPeYo8/6TtD4LMYNkcvEma3sNTGVG/1q13sDfmISKliR+AB5xX2u8e9Zwl8Kc3Kc25hyf24fzQuDcXaEKR83AVDfCPlYzgSAmz/+scn2NuqTf2OPNdu65FMfRwCGxEihYfiQJehtzmiMyNvucN4A2dzHAbVrP213vAH000FMa4o/AV74nEdrYuskkvzn7hhxa6gERG+uszI2ExLYERpaMiIkAhnQ01MmaH414NErMZuKPrRTzUgDWMSTQ5j0W3wL+yymLtMfIJY6GWx8xueB8Za6leCs7y320Xw+ESZe0E3cBwA3Oy81djLYM7c3+TiYbA9FMWCdUV5EyAIgoMRysMhwcqMeLlXUFKIpcAWoM8bFp9ttfEa01dAUhI5xs3Y3BedkXuJa2qVwticWwH8dVvU8c4ITcK++wK50UpIORSgrKb4RmBREy8Iha6/SoSKFMgaT9G8uQscBFMjQPweITKJODzOUHLj1+isQI5KFgLBhXhBiHNQJ/bQoTHF2oAtV71W8RZ+t40HUtQgGcefhP4IjAk7Jgapgkb4heUPTxzWNC4i2TAxAmY+SQFOGNuE0p/7IWwazEZAi6qEsdUZ8fqjl3lhMQjFcQ9zmt57p0c4tTGvygFML01cwGTgzcy7WfZClO5e/vGH3GoYIxCCz4fhV2O6xZJ1PHqLkMZvtra8IeVfOr/m7pm7/gDBsNonSnhuCIu5Xjm6lHhAcdFq5OR8jWaORhVykV3mrdANfR6gndQ/cbeEoPGN4pPVGsUYjeyrjp55tpDseBDOU59VsDu4uE+e9oiMTdGKeA3/1hUcFspRtAFqVQVOi3ZE5zf2S9YHjEmPiuOEJiyqnwDj9RJFhfI8EcMcdaPP4mv9NndCpsZsPe1v0r/9cfYaNe80//ffflrHeh26Nw8c5zpGRf5IHmRxbDQBF4JhzPYF7noMm4mn0Ye4LWgpRWWhNYrn7BmrRqd5f14Io1YM4yaDMSKCpD1cGIHqMnQ2XcRN74vS8MbYdpKanSX0HNQhMMO1BMq+knc1SZR1AVvEXocks97R1EGaOkM+mIGzgiyYy0AoDPsFkM9VmwnyEYEtoci2rNrWIt1+8Hem3sGdq0xJkCir7+Cc+/LXg1ss+rm0cn9FmbNjctWlxy3LCPwRxgpFQpHIIcYe4cTtGUv6eYRGknEdQCD1VHgIye65eXoZgZ8imCCl0sQjB3Gm/nHw1vRj4s9vrgKgpUHgoRR2wQuKau48bnnOt+fcqhYub3AdD32JE89b+jbzuGnp5xEUReLXpXkzUhU+GOIGzkPV6jYB9ugi8IYxIjwwLOVkig8dnron1JsQtW/gGVy6VCV+uZfBb+yb9fhg/7xEC46GNEDeOiR8NLCAoX26yOfjnzxLSxvZQAZnT96nfzz+OUnqUPahQy56IUR1JL6pquobEqssDnCHeJxpQZEY56uW58Tuh7zBUedxZdTSPzS8HMKNlZ8MZj8Z/7xy9E0YqxBlC2U0dW5wPU2jVlNEhcEQWw1F4MToqmwZBhLiqGeBaLX4pVREC5gEEp8VvO6MNv6WlUdqJa2mqpFvjkywcfQwwOI3xyJtfN9aHp7FZp2ToIjEfdDiIcS7Z7amEfgTjHdaLYb3MvdPrMfS5XPj4QBVvC798UwW1KJrUOQrqnFmQJx/nC1lu4hgquFrU/Lzd32225Pv7W2dUcchjyDo1vhuLmMnggqha4hLIlwjWXvKElJIdDCjth87+NSDkcjUzd2SAK60Ec2R3ARg2GsMXwlY1XebOW4sFUpU3lCFLbWHonRVUfSduBqIwAKRIsNhLziHKXq+9ztp5yr6dN+TQSF1ac8SfWvih1F/EAnqutWmdw4vqmO4P9InUYawp6FbVedJRrzx1boDJOQWCGq/o+947pEqafCnbjSG6uqOPwPFjva0+CyVnhm8aa+066vtAgTRo9QI9+/SgT5FtnIrVPftc1IqwluRBZrtFCndM/B9VFffaiwIWyPIWKrz6jflukM5z625lX7r52MOegdK+cLeRBDr2ZQzIwhSdm3aY5MU6udi7svVX5QZdZst2xOf9g5+pVa1Vt/uOecYjwI8MfZqMDRY3jtkSF24VOAl4euundwWtPsA8Ghqbt/ffalHfvVP8qvcz8xZbC5K/ED7JHKX/M2Iz3elqk57ODK+ScQ5YGF5OPo2YbzOzKY0H1kBpwtl01B4EreJR+TphA4YLcagRHd9OqMYIUa3Jnhzo+qccppD1YxPPsoIswBPFdo33ahO1E+RmMzpp836ZrPe+NtBjnTbEbmS/6/sYaWSqbz+BSNhohOlHheDsZqp4tbCrJ53JPFTz1kPKwQIhLUhWpHkksLn+/lZmzGGp370pUr14iV4x3WlhDpKZeNCw2WtzorMiNBPYWNDwppZlRHZZLVnSbpTwwSjDIVGgzUwnZ0++hijK2KBQSnQsI5vqpn+gogeOt41E//C1HfSzKhSWZeCzTBxPbtbLE6A0kAvif6DYi7X9j3i2Olxwf/4+ST4x5vnYugAl3MhMlHr60z0MSc7VAFM8lXTDrcIxq6DdWpN78CXb3L2BZ8kMRmK7bybZLsN+s2y4S6SeBNDMKrlX4vV5lizb5yPtyIx0JtxU3Fn0ag/l8zsOPWPyifDx/vnwXs4eozgjvglSePS78wxyF036nUY6hfva/X4hdmKModX68B1GDtDYAeynt6Xl2FDkI8HTodj0AIEBlePdxURE4tgQoKNAdyZkBTZhbYhqxnvnOcswUTrunFsgKV4J/9kSLJ7Ncz0cKg/s+wzoXLNpolZhzB0Dq6G98oVD1+CIjOzlCC3U5n1Yc58P+/7jY4i6debuLwt//ydmWF/VfchrP5U88iQ0OmhY3lf6ll2ybpK+2sCT+6eVqITTg7JGBYaWzFt9/5YBvzCd5UFRJZ6whQl3p4Z381Pj64Pv9q9SRRGxsapK5ML3vnleNUF4X5pMd5g+r3hXrXdKmUCOdOa0LmtfctWtfEzj8lmTD2QpAZjvZi1DHJ3lPKDCBsAcgcjGrUSQ31QzB9JmC/Ca2DY6sVXCWSOapAET4fDUPJnRZK/NnQQPOcGZlkcCYH+3/24qMaVdzeD9vWuyDX7W5N0931MUbz7WZzzRFtxL+UdFJ5ZHODvHxHj7+Wd9VXeLAxt//DablTEKOIK/NmEQN+d/rK7v6gsF93++hbwMZmHYLMwbYYlK+79B0umMM9ukiaOMqp0gzkK7YXXSq9rVkeyKNnZXvtDpNgQo5tnMmgSRqYaA0xuS0iMV7bfcH1jdMX1XbF+8ZoYLliE+7apM30DDFmxTn+fSnWqT4Au/61Z/wfh0RuohD8NXv/QMV6qpAe/A5sE68Kxkfi1JUK2n8WdWZ0opzc3oEuYDTEaKl5+VJmKZhVjWDGurnogEPxZBX5jJdmQkJ8loNEOBOmojgutUOkeKpSQJxhDwjBqS5w58KyFrZBc/WS+q9bQiyTLfnkTlICjOAwnVxN5oEIo3SdhdhPYUojzKas4r2PDVGQBhc5GyF0/x4Y1ScV3xFLDEORGkVEI58EHpa5Ap/5loQ7RbR1Um7tivMAgSZGlyHjIfOMB7IYhCHyIzSYWPBa6t6CwFD5FEhKGM4ATxEzMSsUhKUSUp2VhJZwDd8B2YbD89CMWJNNEO4JNZNRe70yyNePmP34i4PR95h22s9d15pWUpOGWGz0PK000CRisLTspjt3m67dv9/sqsJg/LCzG6bPow7baFL/RSAKKv9MnzsL7vruh8PnRbLjQrVTbNKLNC6Tq3RprGhjBZc6TyJZPZz8QYcxs0jXRswBBClEysSEbkriJ+9gsjPPX6KX/ha4HiymV+K3SKPtDLxZsrvGSv0IV8oHdMrHqzF9zcmDcqPXvKlA+kcnFp2oxOE4jV3qpzYeiKZm0XSb5i1V/OzMe2CGkE8E67NuTQm3Jxq/fa6R7v5Qb3Z8b9I5nentgflJshjnptGynTL9Xr7irVMwHd+eONHOxuRgCDhwsNjH4FhQGIK4USGV8qex/Gf8JzH0iBq2vzDv0rZFTDrLnClhKanrma/n2PgEmXiKmSyKoWrwGzZZLB1h2ulSOZZM1VF0yfw52T2FQvAAFE0XkbJBM1ZE1WAPSdKQBAM3GxdZGSKaT58bc/dg1v+j9BmXh85R2qdNLRwzExAyQtP0Il7eJq1gx75iPRxqvNG9+XrK29K+0lQQxDjvFB/sPX83MjUaIoufJHVKHI+ZWnD0EozvMw3UrJCz7kL6CIKfigXc9M/X5mEy+vTdY65Rjp1gPDrUSC3BOCdMwRpiN4AcJcl5SuLV1dOxIjDFmT9jjzQZQ5BSKEaerFOcACQurHsONNmVP/Cy0nSAyAy1EEb89j7A5GGbZQMfB+vkvj51xwz7blQk0GoJBEGzd2oz57rpG5LNjPdaOYQVDAy1twCmsI3jBjYE+388ULM1Xsj7QeMxvUMFm/PtQtW5+MwbS6Xlm68GUBC5dbHGBwt2gaRgTlDx4shTT3IQU/6uleR749RZd77an22oszdJmV4x+WnBL1Ijt7qcERhJQYRG4Edlu6c+PkcwzTvWvHgkaGiGaAem3aIaGGjuhkf7VxqmSeTH5lv6I9kegqBAiSIx8GrQ9akRwi35ajEvabGm21djT3fUgY/mjQsUcWzAnI1CzZnRe1WEcW7V+c3GYxsbJCLKtKFY+JLYQJNv86nqn2dCYp9HPak3S6QWDDTWrFZq8RoOpcfBls4gktgLr8sqtBClqfjnYaDIU1WoUq2saBgV6XVLNUr2mtshg7rz+qpkliS3Ew2LlClsQJ8OmCWvqX78Kww9XuSev0QRyMoJtcwoVYOE55kYxJ1VY9lLQA4iNJPG2JwOr/L/xN/d6dwan5x1FYRQ4ca6HwijqXU8Gp/s692/yf1MG1vOWIDcSPUDwskyYyik+BQzbcFw4s/JtBec1EoeIp+89W8oB0YexuSjmGqA+wTowvu/H6AHBn83EZmN0FOfct7smdi0FGveKGLSuKv78t0bOmBfZc4QZl7BP7gsIDg5entZRiCgOzEJHU+msPCw3i0w5IragFE7961pBBJ0t0OFEb2ux2l2ywvXvd+xWIExEJ8FL3OrimnUEris4G0Q4qeOACLWIj6SQWblYXhadelSIwhzgMWPkQOIx1Ebw1VyRWgCYU3lHfDlkDlcpiC8fH/YZWMXLmJVQ2MlNGQ26xvJu0GUApzFGSid/OmceIE6vndCTkGcvFSiz/+9Kh+O4vbl5p73sk3lu88PA6Jq4mFG7KihsBRt5nZuDYgxGS+g4creO+yDfxY+ujYuxpOm3TJftpskcpchrQ+KtpBROOgYucIjlOJG6PCnML98R7qoqid4YSZwn8YlYxMllYUEEvZwRJPdtC9Kn2QlU95+fCedyIBicSPXNxpPxLeRqQwpsXeeVbIkNKQAJYbSLxgzzrJF6faT3PANKu1Fr/YwDBsP+1k4DRsUxuKueBcPa1E6523CgZa5hb7z1nTnW22qOeWf1jvG+k4RklNx+soDt2fhKivSgufB+LNrYyMbJRRwRNhO7dvuoDkeUT5DQWS+PJVn8LEkZgX003qjAaWwChoXJUTzL9dfG8Wukcdck+EyMeste921CMdkZzLgc/m5qQFpNZS5K4mQq8dZ7zmCHLXCxuYaSX6aJ8pmY5ABJVBcHq0uAvxWbixLf9XiLsU4Uix7gVgbG6z/asqYQQ/6VjOb30lf4knWHZ8WEiPs4aUSFRq+sdeVlucJdiJq/KppHeAiMxjkqtelbRRdebFOXGz33BQTm8+TYSqFac0/EndhJEKsJ1ilRtW6b/3sBU1A0dQvhq01OMOjkTwKOnHVl7T3k1S8IFH4/sotahvPxYYmlG+sJfGg9UG7bs3SsWPwPMVUbhH80gIarqc+GT0V1oOhTycRNbxA7M8Y+FWvD7wsbXWxY8JeCsAoC7cKGMPTrGd3tE5gY3cEMq0OwudgXOHwZa8O4NO8Iin5NR1SD6O+KpYv+jfAq1oEJ+DxwLhJ3LfrY6Pr4YxdjcMkYwj17tgExTJ/mpjh3RS7G9fEilxAs/tiN4abk/RRZP2OGUDR3rpvgloLcZ9hsFDX20OvRdpT3F+/sBvExMXtUzG5nxTtY9UdmIDpcS9Wd+JNyw/ZPh4sbzgFJN+adPvMFRmif951xomgCSr18VrBLAAvKdn3TS9APwDOojGEPSng9kzAOwYIw6sXzFIouf5gQu7mEmP6HsMUE8EX50gc77s8PcrRQPfPd5IMsRDk0IqJbqhg5CcHPY7QQOqRUbvCNzGGFL+fBMPqB5sdrW8EbX7QLeyfirQmlcRcWEFztMNUfNT4DGE/7IGd8ggMJZoFnyVAQYuq9UbQSrFAL/A+WW/NgD5SkNpbWgOJ4LrNZIF1KCMgETg6ZwOfuXyP1pm9PIPPRCivZwRV8F4t7qVrEbtH5Y1LxNTuK1qLmffOlsqpJpJiCzSuzlojFv7TMv/wUJgwMCVQ8/oQP0wiaW9CAocbp0C7sEHkMfwyHYwUhD6MvwNX9aBO6UzDtt98d0yGCJsa58nZMcf6a7ETxUb86p+zIi68gyPG6XyoG+auoyyS4uhQjrlCrwN6KX/QtJFHuPol5FI46k98eBo0laAKa7vj9t2mCnVgjmDIjvtO/JDdofEJWxIT67G6fpLA638yUwKqwiIi8Mv8Q1tmNYQ9f6hzusKBhkUUV9lD+rBkbuhFsQiMG97YKq75UsTNxNcGMp40ny3w8nrFtsZ7IkeacJFtddFRgXU5ak2+UPo1NNMyKn43yuNSTFO8CVcyQaMdPs4dCRPUwjqin6NRVhjiHaUUWGOK5Mkxf+GSV1yXqwv5Y8MdCjXHm3wa/jsNKrFN483LR/ft7RRNsJgJ//KVgOUwaEOTLlwQ/hODAyxBcVVmZc9RZ6JGIAfHvNxZJg8IxAyXcBPnpNrVZPmP56fyHH8Wa2Bhnko9n3uDslPRdxxOvn72iDYyPrkg4c3yr1kgYtTdV7LQlq4FCp1ugMxheB6oM/8qkq4T0bXfeEZLTpdR49IoL3wdfIWPI+A6v4hhXtbu8sG1dcLN63Y3K5lEE0YGjf1iI7cTn0b7pMUYwcYnSySU+48SfdX49Wqhc5a0we1Z9byvyDxDE3LBMHtFvFG/vjG/A4X6MIfJ/Q3jaZ3LRwJuvlwZ4BMn+EQEtqeW/bP5q6VlxJRyfxQb551xOMG3uQJo3o6rOvuI2bwZFsujRgTm5gaOjo5tmbq5RiraYuUtnTKC925buCMj0d4YkF/o4ROfQ8dWEn5lCiuxokSTi5OYt54SuYemhJmV8hLf62qHQfgTjEquSigRz3pq9K0IrfBJTrJWhIeKQmFLhGxIiDbCQUO9Mlvu8FDEe2jBWJCZWWBWtm6SRx0fVyRbxKJ81FRJKjC/DQLqgZF/VIRzdjMldEt7DFwL0IIofqtp3UfCVJLCvz8TwHCeXcGVDlVUxVqtXY0NVMrsyfyYP+RLnfrdpl+amRl6mlP7P8/Aw0NPrVS3X6SSVXroKVqdT5H7QXfXSX9Z5faf3+gE4jxHhBN7zy15pASImfSj696Y5vYkDYJwe7cL2oIcuI9Eicos/OBidRnS+giL4CD2IvQIT1c3jVqCx40ZR4u1i0RsQbxetfsQSvAQXT/vgWzb54DC1xlTIM3wpojMYZuYvJN5st09HrdkWwXeEY6pYOSYifCHw3UbNRombi0Z7SV90FpoF7E9SeymDeKWeAkU/in8XHzFPExsISDhPUohcUv3z88mJPxHiuwye6Nkz49NLbgD/oH+hl87ulOr/0Svndvwk+19u9ksk/0kUS8GkC8RcAi199IESOq+DPi6TWr/9GkJuJZEd249OX10QguC9ryAend5Zdxk0/fT2KGwddXE5E/wsAPRN0zNf3dz1Smo2itRV4V8rBRyedJ6QMxfYhILrMqoJJ0fIWB+xxk9Ob8KwcwTqKRzrle1B8I0TkhTavX0zQQ0iuSSRIlxSySWw/YtGmQfLvqjlD1QdlFySYMw7RCpw6EPU9SN9J44TiZpRUQtFxIEmgrh4ITHobO1M0H2IT+N1VTn3PzDMh/tVOXkEw8N+rXYsq8FrljmqfgXwECq5JBFniNnjrHg0ojPoZH0z5DqTTtbbC7r3YdsxVLH7ICWMuQ5EkeLWr6Ge7z62eLk/g5Zkc4iQvDmfAR+RtJIv7MHxKLM0RKDZylJ9BPcSioWIMkd5Je7GEy8bDUMnamiAB4EAZTG8FajoiEZGhzYqOrI6f1RToP3RTXA8YwqVh4/y8EX6O9xtiI6wzR9qu/Pqylan78N+1TNH9cVczNSsVBv71MZstaVWLjTJmFupoME/B+frZkYGw/rvbF0McvZTprXuwibvFM8pG5NMp3d5Gna4QCxdNeB3u0Gy9iY97IyTWvG9FLxLo+9LgEh7yvac33d8cVdMl1aeosLvjnZVHfDXKvkvp0a6fQC8pKf53jWr8dVm/nFdAnTaJS9PuJyI1+319xinUnNYOx+ZW3KYN2j999qKu23lI22Vtvq5tuap6Sdt7SPDp2dwmQHg/4tpnUfWe2qDezZ6bpMHNrtrizu2emwb0O8PN4DGOrD1gA0+2Ai3CWKzv2zxt62w7MTbiJONdvfbqWPPRp9FlBzsVORo6Qtu3e0el9xY3f5D3iBH4oyVvZ1FRzPc2UpA3Sh/JVHOQYOEu5QnoLJ0nG9WyK82DncfkOMWcofKPGd0WuUkG0YCUNDS/h+FPxrqIX6hrvOLGc6AR0ldGqh8/3gS0RgOb99lCUXmz76vkR9lRLrXa8uC+rUf3Kl23AVriPuyZdETYPpr0ft1EPn0l9ERPDi3a/hxfZv1caOZf4CJ5//f/wHk4zsAFK20/BuA/N/5e0cuTyOHyio5bbkwgbfftnjLmW1edXlADt2qIr5Zccsjh66lwsl/XLzCeAHn5a5EOsihskoFy/EdCnLoQBWQ/96Y5Zl5vc1b5Cq9y2pNBDSQ+WZ9vPlypTx3rTLG2++1ZS3tedGYWIfLVpKffz1KTbf8kOafl27E8ULz6+2hLaixMsbpdinSk1wJabkX+661NOe3YSKoUcL+/9cxS5B2m2zjTknJv4y0DCMu3G2KCK57s6lX+DkLUOncOugsu62k89zrEBOTfLQZkj64jWtjO392YTOZzoOerkXsY3zoCxd8HnZ17fj5UZriGM8vHkQ89vyWuFja89jvEYFUKkP0wQed772PUMrzIEFRhOdOquyMxShKunMz2fHc/GhIs/FfsuQepGZsksRroo3xe6pGRl3021hB8bxPDZTRUb96wqjoWhUjy1WktXQR0bZx9cEc9qAgwHYg8UXRNuj37d2RcSjDRTKeU9u/lQeei7W4eW3PvLS/NuwZ42Dtovgg16JSgH6rQ2ls98b/wKeUizT1b5LS9v4O9rn4yUcRT1aP4R2Pk/bi51Ob1JUUCe/jpFOsR6z5wa3dPxjYV9TdsnN7ceJv+lWSdsG+zSfogcObC487mVdG2+t4aTjZ7XeDSBAgxB3j/xNn/Kj/SaTwDuBxa8uxAF71Tgu8fX87Tp2+7gJKwQAC+DPBbsX3RLk78nSQ8gsUw3rNuf3nvxerXo3z91KJd1bgcZ2XNHc5iPlXAUCv3RVw+TKXR3x8CHNs23gtieqaTXzJcY77mP4ImL4wvg3bZ+ut5LORCn7ZF8i7zrq1VHtEnm45ABS2XSZdPf+LA4JF1CwMBUZE/IvUSdsBihYzV30LuCBC0HJG/Ndj/pyiObTVw8nbh3n0smJvyAEJ+vLL6v88yg/dim75J/FFpyeA+9wfjMFTyia1txxIEPeBYHSVMmiKh71/jCJe4Pg0cK4OwtKxQhxHEyYE6yncGiQAOHMXjXuRrW8fEK70FzCUoIJlC2EsmKIHAgqXYh12YjFOwjZswrEs+HHW3lQrPjChtdfiUlBPeLUS2x2h20C//PGjwJhkU9MyEhyElViIjX9VutRSOJvzGHeZcO95J9J6Jmo51nseT7DbbYO/xMKN0sVz3ljnBVS6XB5DNwlbTDSSyiJZr+OsK8mWauyt2EQ055qF8zr4E/Qa8JlP6w8N7s0UlisKNzX9zBTDncdAAAN/tUKSsPjhdZuXNWvtSCv9fL4WcazM4lwRsBaT8DQksAsGEPT3mjQH26eQ3wX4AyVRtTl8y4Os++1d7jXLcgXUQ76V/NK57vOlyOAbHJxblYAD+hrtPHVSCuQOPIh34jY8Dx8eOJg/jvOcPVLNYl8m2BgupjVryYA8pgundsa17YyF7reqGDs3Gd2I3UbJ91atHwIqVgDOAMRZEKmjZ8F4rp2FiPD9WShL8rMwyoafhTNVdGueoCZfJIDqOBkL41RUHeVzX5xqdNwSb5xmE7Ro0qBRGx0nO4dQOnke12UTxFFKVKWlsTEPs2PVKpulxbCRoajRZ2O1b6zxkG3RaoXVNtum+W6MYGPToEmmxaVqgWpmZQybcSaVKh2aXOEqVrsLW/+W56vi4OTj7OAcdRq0G81WHALZR6qOlKVeQrZwpHGXAP2cxm4lDQvUjSuaRDFd1847GQHRM2xVMwvWfLHWAutwtMBAWUN0dCaPNIXq5iWSg8Ojwxo5cT6uyljIP0J0W521p/p/9m/0RQ==) format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    
    .StatblockWizard {
    font-family: 'Source Sans Pro', Arial, Helvetica, sans-serif;
    color: var(--StatblockWizardtext);
    columns: 2;
    width: 170mm;
    break-inside: avoid-page;
    clear: both;
    
    font-size: 0.7em;
    font-weight: 300;
    font-kerning: auto;
    border-width: 10px;
    border-style: solid;
    border-image-slice: 10% fill;
    border-image-width: auto;
    border-image-source: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAYAAAA4qEECAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEuSURBVHhe7d0xTkJREEDRh7+iIbG2ImGxLtI9mNhYEYSfjwG1ErjVOcnLm2nvBmbQWC3/4fguZ2531fZX3M2Yxvvn27LxH8/r3fgY+3k+9TzOq6fz8jpe5sd9/Ow5h+bxhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdmY/7bsZ0uDxG67jvbab1dpm+XV1Rdq76vv5qy2ON8QVSYBdKd2v5fgAAAABJRU5ErkJggg==");
    margin-top: 0;
    margin-bottom: 0;
    margin-left: auto;
    margin-right: auto;
    padding: 0 10px;
    }
    
    .StatblockWizard-SingleColumn {
    columns: 1;
    min-width: 100px;
    width: 85mm;
    }
    
    .StatblockWizard-Transparent {
    border-image-source: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAYAAAA4qEECAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEMSURBVHhe7d27DcJAEEDBA3IaoGG6BnOyECBnxi+akfY+6WtgB43Tej+W+Xyz31bb+ZlzHRehd1obfvU8v47lM+7jNof/+O05Q3M8oSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0JHhI4IHRE6InRE6IjQEaEjQkeEjggdEToidEToiNARoSNCR4SOCB0ROiJ0ROiI0BGhI0KXtpbRssu75zrWVR9oc101hxrjCaP8GY01jQ67AAAAAElFTkSuQmCC");
    margin-top: 0;
    margin-bottom: 0;
    margin-left: auto;
    margin-right: auto;
    padding: 0 10px;
    }
    
    .StatblockWizard-keyword {
    font-weight: bold;
    }
    
    .StatblockWizard-nbspbefore::before,
    .StatblockWizard-nbspafter::after,
    .StatblockWizard-keyword::after {
    content: ' ';
    }
    
    .StatblockWizard-title {
    font-family: 'EB Garamond', Georgia, 'Times New Roman', Times, serif;
    font-size: 1.5em;
    font-variant: small-caps;
    font-weight: bold;
    
    color: var(--StatblockWizardmonstername);
    padding: 0;
    margin: 0;
    }
    
    .StatblockWizard-sizetypealignment {
    font-style: italic;
    
    margin-top: 0;
    margin-bottom: 3px;
    padding-bottom: 2px;
    border-bottom: 2px var(--StatblockWizardscreenborder) solid;
    }
    
    .StatblockWizard-abilities {
    box-sizing: border-box;
    break-inside: avoid;
    
    display: flex;
    flex-grow: initial;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: space-between;
    
    clear: both;
    border-top: 2px var(--StatblockWizardscreenborder) solid;
    border-bottom: 2px var(--StatblockWizardscreenborder) solid;
    border-left: none;
    border-right: none;
    }
    
    .StatblockWizard-ability {
    display: block;
    text-align: center;
    box-sizing: border-box;
    break-inside: inherit;
    
    max-width: 16.65%;
    padding: 1px 4px;
    margin-top: 3px;
    margin-left: 0px;
    margin-right: 0px;
    margin-bottom: 3px;
    }
    
    .StatblockWizard-abilityname {
    font-weight: bold;
    text-align: center;
    }
    
    .StatblockWizard-abilitymodifier::before {
    content: ' (';
    }
    
    .StatblockWizard-abilitymodifier::after {
    content: ')';
    }
    
    .StatblockWizard-features {
    border-bottom: 2px var(--StatblockWizardscreenborder) solid;
    margin-bottom: 2px;
    break-inside: avoid-column;
    }
    
    .StatblockWizard-feature {
    text-indent: -1em;
    padding-left: 1em;
    
    margin-top: 1px;
    margin-bottom: 2px;
    }
    
    .StatblockWizard-crproficiency {
    text-indent: 0;
    padding-left: 0;
    width: 100%;
    display: flex;
    justify-content: space-between;
    }
    
    .StatblockWizard-cr {
    margin-right: 3px !important;
    break-inside: avoid;
    break-after: auto;
    }
    
    .StatblockWizard-proficiency {
    break-inside: avoid;
    }
    
    .StatblockWizard-sectionheader {
    font-variant: small-caps;
    font-size: 1.4em;
    break-inside: avoid;
    break-after: avoid;
    
    width: 100%;
    margin-top: 10px;
    margin-bottom: 1px;
    border-bottom: 1px var(--StatblockWizardscreenborder) solid;
    }
    
    .StatblockWizard-characteristics {
    border-bottom: 2px var(--StatblockWizardscreenborder) solid;
    margin-bottom: 2px;
    break-inside: avoid-column;
    }
    
    .StatblockWizard-sectionheader+.StatblockWizard-line {
    break-before: avoid;
    }
    
    .StatblockWizard-line {
    margin-top: 5px;
    margin-bottom: 2px;
    }
    
    .StatblockWizard-line+.StatblockWizard-text {
    text-indent: 1em;
    margin-top: 2px;
    margin-bottom: 2px;
    }
    
    .StatblockWizard-sectionheader+.StatblockWizard-line {
    margin-top: 2px;
    }
    
    .StatblockWizard-attack,
    .StatblockWizard-hit {
    font-style: italic;
    }
    
    .StatblockWizard-hit::before {
    content: ' ';
    }
    
    .StatblockWizard-attack::after,
    .StatblockWizard-hit::after {
    content: ' ';
    }
    
    .StatblockWizard-detailline {
    text-indent: -1em;
    padding-left: 1em;
    margin: 0;
    }
    
    .StatblockWizard-namedstring .StatblockWizard-keyword,
    .StatblockWizard-weapon .StatblockWizard-keyword {
    font-style: italic;
    }
    
    .StatblockWizard-spellliststart::after {
    content: ' ';
    }
    
    .StatblockWizard-spell {
    font-style: italic;
    break-before: avoid-column;
    }
    
    .StatblockWizard-list-ol {
    margin-top: 0;
    padding: 0 0 0 1em;
    list-style-type: decimal;
    list-style-position: outside;
    break-before: avoid-column;
    }
    
    .StatblockWizard-list-ul {
    margin-top: 0;
    padding: 0 0 0 1em;
    list-style-type: disc;
    list-style-position: outside;
    break-before: avoid-column;
    }
    
    dl.StatblockWizard-list {
    margin-top: 5px;
    margin-bottom: 2px;
    }
    
    .StatblockWizard-line+dl.StatblockWizard-list {
    margin-top: 2px;
    }
    
    dt.StatblockWizard-keyword,
    dt.StatblockWizard-spellliststart {
    float: left;
    clear: left;
    }
    
    dt.StatblockWizard-keyword::after {
    content: ' ';
    }
    
    dd.StatblockWizard-listitem,
    dd.StatblockWizard-spelllist {
    margin-left: 1em;
    }
    
    .StatblockWizard-supplemental {
    display: flex;
    }
    
    .StatblockWizard-image {
    border: none;
    padding: 0;
    max-width: 60mm;
    margin: 5px auto 0;
    }
    
    .StatblockWizard hr {
    margin: 2px 0;
    border-style: none;
    border-top: 0;
    border-right: 0;
    border-left: 0;
    border-bottom: 1px var(--StatblockWizardscreenborder) solid;
    }
    </style>
    <div class="StatblockWizard">
    <div class="StatblockWizard-section StatblockWizard-general">
    <p class="StatblockWizard-title"><span>StatblockWizard Logger</span></p>
    <p class="StatblockWizard-sizetypealignment"><span>Medium construct (software), lawful neutral</span></p>
    <p class="StatblockWizard-feature StatblockWizard-armorclass"><span class="StatblockWizard-keyword">Armor Class</span><span>10</span></p>
    <p class="StatblockWizard-feature StatblockWizard-hitpoints"><span class="StatblockWizard-keyword">Hit Points</span><span>4</span></p>
    <p class="StatblockWizard-feature StatblockWizard-speed"><span class="StatblockWizard-keyword">Speed</span><span>30 ft.</span></p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-abilities">
    <div class="StatblockWizard-ability">
    <div class="StatblockWizard-abilityname">STR</div>
    <div class="StatblockWizard-abilitynumbers"><span class="StatblockWizard-abilityscore">10</span><span class="StatblockWizard-abilitymodifier">+0</span></div>
    </div>
    <div class="StatblockWizard-ability">
    <div class="StatblockWizard-abilityname">DEX</div>
    <div class="StatblockWizard-abilitynumbers"><span class="StatblockWizard-abilityscore">10</span><span class="StatblockWizard-abilitymodifier">+0</span></div>
    </div>
    <div class="StatblockWizard-ability">
    <div class="StatblockWizard-abilityname">CON</div>
    <div class="StatblockWizard-abilitynumbers"><span class="StatblockWizard-abilityscore">10</span><span class="StatblockWizard-abilitymodifier">+0</span></div>
    </div>
    <div class="StatblockWizard-ability">
    <div class="StatblockWizard-abilityname">INT</div>
    <div class="StatblockWizard-abilitynumbers"><span class="StatblockWizard-abilityscore">10</span><span class="StatblockWizard-abilitymodifier">+0</span></div>
    </div>
    <div class="StatblockWizard-ability">
    <div class="StatblockWizard-abilityname">WIS</div>
    <div class="StatblockWizard-abilitynumbers"><span class="StatblockWizard-abilityscore">10</span><span class="StatblockWizard-abilitymodifier">+0</span></div>
    </div>
    <div class="StatblockWizard-ability">
    <div class="StatblockWizard-abilityname">CHA</div>
    <div class="StatblockWizard-abilitynumbers"><span class="StatblockWizard-abilityscore">10</span><span class="StatblockWizard-abilitymodifier">+0</span></div>
    </div>
    </div>
    <div class="StatblockWizard-section StatblockWizard-features">
    <p class="StatblockWizard-feature StatblockWizard-senses"><span class="StatblockWizard-keyword">Senses</span><span>passive Perception 10</span></p>
    <p class="StatblockWizard-feature StatblockWizard-languages"><span class="StatblockWizard-keyword">Languages</span><span>Common, HTML, CSS, JavaScript</span></p>
    <p class="StatblockWizard-feature StatblockWizard-crproficiency"><span class="StatblockWizard-cr"><span class="StatblockWizard-keyword">Challenge</span>0 (10 XP)</span><span class="StatblockWizard-proficiency"><span class="StatblockWizard-keyword">Proficiency Bonus</span>+2</span></p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-characteristics">
    <p class="StatblockWizard-line StatblockWizard-text">Welcome to <span class="appname">StatblockWizard Logger</span>, the tool that allows you to actively use your StatblockWizard statblocks to log your Role Playing Game sessions.</p>
    <p class="StatblockWizard-line StatblockWizard-text">Once you upload (or drop, above) a StatblockWizard SVG file, this tool will analyze it and register its content as actions that the character can do - ant that you can log. Just hovering your mousepointer over an action will highlight it. Sometimes that will be an entire section, but sometimes only a small part will be highlighted, like a spell name in a spell list. Click the highlighted area and the action will be added to the Log.</p>
    <p class="StatblockWizard-line StatblockWizard-text">Apart from actions that are in the Statblock, you will often want to add text manually. You can do this in the editable text area. Clicking the 'log' button will add the typed text to the line.</p>
    <p class="StatblockWizard-line StatblockWizard-text">The app will also get your characters hit points from the statblock, and keep track of them whenever your character gets damage, healing, or temporary hit points. See the 'hints' text next to the text input. By the way, that hints text also hints😉 at formatting options!</p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-specialtraits">
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">StatblockWizard SVG file analyser.</span><span>The logger knows how to read StatblockWizard SVG files. Sections of the embedded statblock will become selectable, and when selected the keyword for that action will be added as an event in the Log.</span></p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-actions">
    <div class="StatblockWizard-sectionheader">Actions</div>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">log.</span><span>All text that you have typed in the text area is added to the Log.</span></p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">download.</span><span>This downloads the current log to a .statblockwizard.log.html file. The file contains the statblock, the current status of your character, and the logged events. You can print or store this file for your archive.</span></p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">upload.</span><span>Files you downloaded before can be uploaded later - and this will bring you right back at the place where you were. <em>And</em> it will temporarily enable the <strong>new session using current data</strong> button!</span></p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">open statblock.</span><span>Continue your current log session using a different statblock. This is the same as drag &amp; dropping a statblock.</span></p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-bonusactions">
    <div class="StatblockWizard-sectionheader">Bonus Actions</div>
    <p class="StatblockWizard-line StatblockWizard-text">These actions are only available at appropriate times. For example, you cannot restore a session unless you have saved the current session.</p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">restore last session.</span><span>Even if you did not download the log, StatblockWizard Logger will have stored your last session in your browser's local storage. Selecting this action will bring you right back. Remember though that sometimes browser data gets cleared, and the session will no longer be available in this way.</span></p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">new session using current data.</span><span>This action will clear the log text, but retain your character's status. Also, it will increase the session number by 1 so you can directly continue where you left off.</span></p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-reactions">
    <div class="StatblockWizard-sectionheader">Reactions</div>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">Hover (*).</span><span>Each button in this app shows extra information if you hover your mouse pointer over it.</span></p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">Shortcut Keys (*, **).</span><span>You can use a keyboard to select action buttons. The Hover feature shows the appropriate keys.</span></p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">Drag &amp; Drop (*).</span><span>You can drop a StatblockWizard SVG file on the drop-box or on the current statblock to upload it.</span></p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">*</span><span>StatblockWizardLogger's reactions only work if supported by your device.</span></p>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">**</span><span>Shortcut keys depend on your browser. Usually you need to press a key combination, like Alt+key or Control+Option+key</span></p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-legendaryactions">
    <div class="StatblockWizard-sectionheader">Legendary Actions</div>
    <p class="StatblockWizard-line StatblockWizard-text">StatblockWizard Logger will store the data of your current session in your browser's local storage. Other than that, it does not collect data, and no data will be shared with any other service.</p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-epicactions">
    <div class="StatblockWizard-sectionheader">Epic Actions</div>
    <p class="StatblockWizard-line StatblockWizard-namedstring"><span class="StatblockWizard-keyword">Print.</span><span>If you opened a StatblockWizard Log html file in your browser, the browser's Print action will print the Log, not the statblock.</span></p>
    </div>
    <div class="StatblockWizard-section StatblockWizard-supplemental"><img src="data:image/png;base64,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" alt="Image of StatblockWizard Logger" title="Image of StatblockWizard Logger" class="StatblockWizard-image">
    </div>
    </div>
    </div>
    </foreignObject>
    </svg></div><div id="Log" startdatetime="2023-09-10T15:27:29.207Z" sessionno="1" hp="1" maxhp="4" temphp="5">
    <h1 class="appinfo">LOG #1</h1>
    <table>
    <thead>
    <tr>
    <th class="logheadercol1">Time</th>
    <th class="logheadercol2">Events</th>
    </tr>
    </thead>
    <tbody id="Loglines">
    <tr class="logline bold"><td class="logtime">15:27:34</td><td class="logtext">StatblockWizard Logger enters.</td></tr>
    <tr class="logline"><td class="logtime">15:27:34</td><td class="logtext">StatblockWizard Logger has 4 hit points.</td></tr>
    <tr class="logline"><td class="logtime">15:32:30</td><td class="logtext">The lines above are created because the StatblockWizard SVG file describing the Logger was opened in a new Logger session. That session is what this log shows. Later, the session was downloaded to a StatblockWizard.log.html file. Finally, that file is uploaded to restore the log - that is how it got here.</td></tr>
    <tr class="logline"><td class="logtime">&nbsp;</td><td class="logtext">Please note the <span class="italic">"new session using current data"</span> button that now is visible. It will disappear again as soon as <span class="bold">you</span> add something to this log.</td></tr>
    <tr class="logline"><td class="logtime">15:32:41</td><td class="logtext">The current number of hit points is maintained by the app. To change it, you can use the "damage" or the "heal" keyword <span class="italic">on a separate line</span>! Now, let us have the Logger take 3 damage. Below, you will first see the keyword line, after which StatblockWizard Logger will notify you of the current status. You get such an update every time a series of commands has changed the number of hit points.</td></tr>
    <tr class="logline"><td class="logtime">&nbsp;</td><td class="logtext">damage 3</td></tr>
    <tr class="loglinescores"><td class="logtime">&nbsp;</td><td class="logscore">Current hit points: 1</td></tr>
    <tr class="logline"><td class="logtime">15:33:00</td><td class="logtext">If you just need to know the current status, use keyword <span class="bold">hp</span>:</td></tr>
    <tr class="logline"><td class="logtime">15:33:01</td><td class="logtext">hp</td></tr>
    <tr class="loglinescores"><td class="logtime">&nbsp;</td><td class="logscore">Current hit points: 1</td></tr>
    <tr class="logline"><td class="logtime">15:33:05</td><td class="logtext">To give the Logger some temporary hit points, use keyword <span class="bold">temphp</span>:</td></tr>
    <tr class="logline"><td class="logtime">&nbsp;</td><td class="logtext">temphp 5</td></tr>
    <tr class="loglinescores"><td class="logtime">&nbsp;</td>
    <td class="logscore">Current hit points: 1, Temporary hit points: 5. Total hit points: 6.</td></tr>
    <tr class="logline"><td class="logtime">15:33:06</td><td class="logtext"></td></tr>
    <tr class="logline"><td class="logtime">&nbsp;</td><td class="logtext"></td></tr>
    <tr class="logline"><td class="logtime">&nbsp;</td><td class="logtext">To add blank lines, you can just add them in the text input - but empty lines at the end are ignored.</td></tr>
    <tr class="logline"><td class="logtime">15:33:34</td><td class="logtext">As a last example: you may have seen <span class="bold">bold</span> or <span class="italic">italic</span> texts in this log. You can enter them by typing words enclosed in * (for bold) or _ (for italic).</td></tr>
    <tr class="logline"><td class="logtime">15:34:56</td><td class="logtext">So, *word* becomes <span class="bold">word</span>, and _some other words_ becomes <span class="italic">some other words</span>. You need to write double * or double underscore to add a single one to your text without making the accidentally enclosed text bold or italic.</td></tr>
    <tr class="logline"><td class="logtime">15:35:04</td><td class="logtext">If you want a word to be bold <span class="bold italic">and</span> italic, enclose it in both characters, where the closing characters <span class="italic">preferably</span> are in reverse order.</td></tr>
    <tr class="logline"><td class="logtime">15:35:14</td><td class="logtext"></td></tr>
    <tr class="logline"><td class="logtime">&nbsp;</td><td class="logtext"></td></tr>
    <tr class="logline"><td class="logtime">&nbsp;</td><td class="logtext">Now, maybe, is a good time to try out the <span class="italic">"new session using current data"</span> button, or the <span class="bold">session</span> keyword to assign a different session number to your log?</td></tr>
    </tbody>
    </table>
    </div><!--endlog--></body></html>`)
}
//#endregion demo
