"use strict";
window.addEventListener('load', startLogger, false);

var viewer;
var logger;
var content = "";
var sectionId = -1;
var clickId = -1;
let statblock;
let statblockName;
let maxHP = 0;
let currentHP = 0;
let currentTempHP = 0;
let showScoreLogLine = false;
const db = new DB();
let restoring = false;

//#region initialize
function startLogger() {
    if (canStartLogger()) {
        listenToDrop();
        createControls();
        setFocus();
    };
}

function canStartLogger() {
    viewer = document.getElementById('Statblock');
    logger = document.getElementById('Log');
    if (viewer && logger) {
        addLoggerStyle();
        logStartSession();
        return true
    }
    return false
}

function listenToDrop() {
    // allow dropping of .statblockwizard.svg or .statblockwizard.log.html file
    window.addEventListener('dragover', (event) => {
        event.preventDefault();
    });
    window.addEventListener('drop', (event) => {
        if (event.dataTransfer.files.length == 1) {
            var fr = new FileReader();
            fr.onload = function () { processSupportedFile(fr.result) }
            let fileName = event.dataTransfer.files[0].name;
            if (fileTypeSupported(fileName)) {
                fr.readAsText(event.dataTransfer.files[0]);
            } else {
                alert(`Unsupported file type: ${fileName.substring(fileName.indexOf('.'))}`);
            }
        }
        event.preventDefault();
    });
}

function createControls() {
    let c = document.getElementById('Controls');
    c.innerHTML = null;
    addControlsManualInput(c);
    addControlsDownloadLog(c);
    addControlsOpenLog(c);
    addControlsOpenSVG(c);
    addControlsRestoreLastSession(c);
    addNewSessionFromRestoredCurrent(c);
}

function setFocus() {
    let t = document.getElementById('textinput');
    if (t) { t.focus(); };
}
//#endregion initialize

//#region StatblockWizardSVGhandling
function processSVGFile(fileContent) {
    if (fileContent) {
        db.setKeyValue('statblock', fileContent);
        viewer.innerHTML = fileContent;
        goLogger();
    }
}

function goLogger() {
    resetClickIDs();
    statblockName = getStatblockName();
    if (statblockName) { addLogLine(statblockName + ' enters.', { bold: true }) };
    getFeatures();
    getActions();
    setFocus()
}

function getStatblockName() {
    let e = document.getElementsByClassName('StatblockWizard-title');
    if (e.length > 0) {
        return e[0].innerText.split(/[\n,]/g)[0];
    }
    return '';
}

function getFeatures() {
    getHP();
    getStringList('StatblockWizard-speed', (source) => `${sanitizeSpeed(source)}.`);
    getStringList('StatblockWizard-savingthrows', (source) => `${sanitizeSavingThrows(source)} saving throw.`);
    getSkills();
    getStringList('StatblockWizard-vulnerabilities', (source) => `Is vulnerable to ${source}.`);
    getStringList('StatblockWizard-resistances', (source) => `Resists ${source}.`);
    getStringList('StatblockWizard-immunities', (source) => `Is immune to ${source}.`);
    getStringList('StatblockWizard-senses', (source) => `Perceives using ${source}.`);
    getStringList('StatblockWizard-languages', (source) => `Role play: uses language ${source}.`);
}

function getHP() {
    let elementlist = document.getElementsByClassName('StatblockWizard-hitpoints');
    if (elementlist.length > 0) {
        for (var l = 0; l < elementlist.length; l++) {
            let elementvaluekeyword = elementlist[l].getElementsByClassName('StatblockWizard-keyword');
            if (elementvaluekeyword.length > 0) {
                let elementvaluelistelement = elementvaluekeyword[0].nextElementSibling;
                let hptext = elementvaluelistelement.innerText.replace(/^([0-9]*)[\.]*/, "$1");
                let hp = Number.parseInt(hptext);
                setMaxHP(hp);
            }
        }
    }
}

function getSkills() {
    let skills = document.getElementsByClassName('StatblockWizard-skill'); // these are SPANs already, just add class and event
    if (skills.length > 0) {
        for (var i = 0; i < skills.length; i++) {
            skills[i].classList.add('selectable');
            let skilltext = skills[i].innerText;
            skills[i].addEventListener('click', () => {
                addLogLine(`Uses skill ${skilltext}.`);
            });
        }
    }
}

function getStringList(cssclass, formatfunction) {
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
                    elementvaluelistelement.appendChild(newClickableSpan(elementvalues[i], formatfunction(elementvalues[i])));
                    if (i < elementvalues.length - 1) { elementvaluelistelement.insertAdjacentText("beforeend", `${elementvalueseparator} `); }
                }
            }
        }
    }
}

function getActions() {
    getSectionData(document.getElementsByClassName('StatblockWizard-characteristics'), 'Role plays', 'characteristic');
    getSectionData(document.getElementsByClassName('StatblockWizard-specialtraits'), 'Uses special trait', 'specialtrait');
    getSectionData(document.getElementsByClassName('StatblockWizard-actions'), 'Takes action', 'action');
    getSectionData(document.getElementsByClassName('StatblockWizard-bonusactions'), 'Takes bonus action', 'bonusaction');
    getSectionData(document.getElementsByClassName('StatblockWizard-reactions'), 'Reacts', 'reaction');
    getSectionData(document.getElementsByClassName('StatblockWizard-legendaryactions'), 'Uses legendary action', 'legendaryaction');
    getSectionData(document.getElementsByClassName('StatblockWizard-epicactions'), 'Uses epic action', 'epicaction');
}

function getSectionData(s, caption, prefix) {
    resetSectionIDs();

    if (s.length > 0) {
        var currentKeyword = '';
        var currentKeywordHandled = true;
        var currentKeywordStartID;
        var newKeyword;
        var lineType;
        var currentSectionID;

        let l = s[0].getElementsByClassName('StatblockWizard-line');
        for (var i = 0; i < l.length; i++) {
            currentSectionID = newSectionID();
            l[i].id = createID(prefix, currentSectionID);

            lineType = getTypeFromClassList(l[i]);
            switch (lineType) {
                case 'StatblockWizard-namedstring':
                    newKeyword = getFirstKeyword(l[i]);
                    // check if it is an actual keyword. Definition: 3 characters or longer. If not, this one belongs to the previous keyword
                    if (newKeyword.length >= 3) {
                        if (!currentKeywordHandled) { createClickableDiv(currentKeywordStartID, currentSectionID - 1, caption, prefix, currentKeyword) };
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
                    if (!currentKeywordHandled) { createClickableDiv(currentKeywordStartID, currentSectionID - 1, caption, prefix, currentKeyword); };
                    currentKeyword = getFirstKeyword(l[i]);
                    currentKeywordStartID = currentSectionID;
                    createClickableDiv(currentKeywordStartID, currentSectionID, caption, prefix, `Attacks using ${currentKeyword}`);
                    currentKeywordHandled = true;
                    break;
                case 'StatblockWizard-list-dl':
                    createKeywordClickableDiv(l[i], caption, ((currentKeyword == caption) ? '' : currentKeyword));
                    currentKeywordHandled = true;
                    break;
                case 'StatblockWizard-list-spells5e':
                    createClickableSpellsSpan(l[i], caption);
                    currentKeywordHandled = true;
                    break;
                default:
                    break;
            }
        };
        if (!currentKeywordHandled) { createClickableDiv(currentKeywordStartID, currentSectionID, caption, prefix, currentKeyword); };
    }
}

function getTypeFromClassList(e) {
    let cl = e.classList;
    for (var i = 0; i < cl.length; i++) {
        if (cl[i] != 'StatblockWizard-line') { return cl[i] };
    }
    return ''
}

function getFirstKeyword(fromelement) {
    let k = fromelement.getElementsByClassName('StatblockWizard-keyword');
    if (k.length > 0) {
        return (sanitizeKeyword(k[0].innerText))
    }
    return null;
}

function resetSectionIDs() {
    sectionId = -1;
}

function newSectionID() {
    sectionId++;
    return (sectionId);
}

function resetClickIDs() {
    sectionId = -1;
}

function newClickID() {
    clickId++;
    return (clickId);
}

function createID(prefix, ID) {
    return (`${prefix}-${ID}`);
}

function createClickableDiv(fromID, uptoID, caption, prefix, keyword) {
    let d = newClickableDiv(caption, keyword);
    let c = document.getElementById(createID(prefix, fromID));
    if (c) {
        c.insertAdjacentElement('beforebegin', d);

        for (var i = fromID; i <= uptoID; i++) {
            let e = document.getElementById(createID(prefix, i));
            if (e) { d.appendChild(e); };
        }
    }
}

function createKeywordClickableDiv(fromelement, caption, keyword) {
    // fromelement is a dl. Keywords are in a dt element; nextElementsibling will be the matching dd
    let k = fromelement.getElementsByClassName('StatblockWizard-keyword');
    for (var i = 0; i < k.length; i++) {
        let d = newClickableDiv(caption, `${keyword.replace('.', ',')} ${sanitizeKeyword(k[i].innerText)}`);
        k[i].insertAdjacentElement('beforebegin', d);
        let dd = k[i].nextElementSibling;
        d.appendChild(k[i]);
        d.appendChild(dd);
    }
}

function newClickableDiv(caption, keyword) {
    let d = document.createElement('div');
    d.classList.add('selectable');
    d.addEventListener('click', () => {
        addLogLine((caption != keyword) ? `${caption}: ${keyword.replace(':', '.')}` : `${caption}.`);
    });
    return (d);
}

function newClickableSpan(content, message) {
    let s = document.createElement('span');
    s.innerText = content;
    s.classList.add('selectable');
    s.addEventListener('click', () => {
        addLogLine(message);
    });
    return (s);
}

function createClickableSpellsSpan(fromelement, caption) {
    // fromelement is a dl. Spell levels are in a dt element;
    // nextElementsibling will be the matching dd.
    // In the dd are spell names, each enclosed in a span(class=StatblockWizard-spell)
    let s = fromelement.getElementsByClassName('StatblockWizard-spellliststart');
    for (var l = 0; l < s.length; l++) {
        let spelllevelname = sanitizeSpellLevelCaption(s[l].innerText);
        let spellnamelist = s[l].nextElementSibling;
        let spellnames = spellnamelist.getElementsByClassName('StatblockWizard-spell');
        for (var n = 0; n < spellnames.length; n++) {
            spellnames[n].classList.add('selectable');
            let spelltext = sanitizeKeyword(spellnames[n].innerText);
            spellnames[n].addEventListener('click', () => {
                addLogLine(`${(caption == 'Uses special trait') ? '' : `${caption}: `}Casts ${spelllevelname} ${spelltext}.`);
            });
        }
    }
}

function sanitizeKeyword(keyword = "") {
    // removes parts in parenthesis
    // removes leading and trailing spaces
    let r = /\s*\([^\)]*\)\s*/g
    return (keyword.replace(r, '').trim());
}

function sanitizeSpellLevelCaption(levelcaption = "") {
    // removes parts in parenthesis, trailing colon or period, and the s from Cantrips
    // adds ' spell' for all except cantrips
    // removes leading and trailing spaces
    let r = /[s]*\s*\([^\)]*\)[\s\:\.]*$|[s]*[\s\:\.]*$/g;
    let s = levelcaption.toLocaleLowerCase().replace(r, '').trim();
    return ((s.includes('cantrip')) ? s : `${s} spell`);
}

function sanitizeSpeed(speed) {
    // keep only text before digits.
    // if empty, return 'Move'
    let r = /\s*[0-9]+[ft\.\s]*/g;
    let s = speed.replace(r, '').trim();
    s = (s == '') ? 'Move' : s;
    s = s.substring(0, 1).toUpperCase() + s.substring(1);
    return (s);
}

function sanitizeSavingThrows(st) {
    // if starts with "3-letter ability", space, + then return only the 3 letters
    if (['str', 'dex', 'con', 'int', 'wis', 'cha'].indexOf(st.trim().substring(0, 3).toLocaleLowerCase()) >= 0) {
        return (st.trim().substring(0, 3))
    }
    return (st.trim());
}
//#endregion StatblockWizardSVGhandling

//#region CurrentStatushandling
function getSessionNo() {
    let sessionNo = logger.getAttribute('sessionno');
    return ((Number.isNaN(sessionNo) ? 1 : Number.parseInt(sessionNo)));
}

function setSessionNo(sessionNo) {
    logger.setAttribute('sessionno', sessionNo);
    logger.firstElementChild.innerText = `LOG #${sessionNo}`;
    if (sessionNo >= 1 && statblockName) addLogLine(`Playing ${statblockName}. ${getScoreText()}`, { bold: true });
}

function getStatusFromLog() {
    currentHP = Number.parseInt(logger.getAttribute('hp'));
    maxHP = Number.parseInt(logger.getAttribute('maxhp'));
    currentTempHP = Number.parseInt(logger.getAttribute('temphp'));
}

function setStatusInLog() {
    logger.setAttribute('hp', currentHP);
    logger.setAttribute('maxhp', maxHP);
    logger.setAttribute('temphp', currentTempHP);
}

function setMaxHP(hp) {
    maxHP = hp;
    currentHP = hp;
    currentTempHP = 0;
    setStatusInLog();
    addLogLine(`${statblockName} has ${currentHP} hit points.`);
}

function setHP(newhp, newtemphp) {
    if (newhp < -maxHP) {
        addLogLine(`RIP ${statblockName}`);
        currentHP = 0;
        currentTempHP = 0;
        maxHP = 0;
    } else {
        currentHP = (newhp < 0) ? 0 : ((newhp > maxHP) ? maxHP : newhp);
    }
    currentTempHP = (newtemphp < 0) ? 0 : newtemphp;
    setStatusInLog();
    showScoreLogLine = true;
}

function receiveDamage(damage) {
    let hp = currentHP;
    let temphp = currentTempHP;
    if (damage >= temphp) {
        damage = damage - temphp;
        temphp = 0;
    } else {
        temphp = temphp - damage;
        damage = 0;
    };
    hp = hp - damage;
    setHP(hp, temphp);
}

function receiveHealing(healing) {
    setHP(currentHP + healing, currentTempHP);
}

function receiveTempHP(temphp) {
    if (temphp < currentTempHP) addLogLine(`Received temporary hit points (${temphp}) are fewer than current temporary hp ${currentTempHP} - no change applied.`, { logscore: true });
    setHP(currentHP, (temphp > currentTempHP) ? temphp : currentTempHP);
}
//#endregion CurrentStatushandling

//#region Loghandling
function logStartSession() {
    let previoussession = logger.getAttribute('startdatetime');
    let sessionno = 1;
    if (previoussession) {
        logger.setAttribute('previousstartdatetime', previoussession);
        sessionno = getSessionNo() + 1;
    }
    logger.setAttribute('startdatetime', (new Date().toISOString()));
    setSessionNo(sessionno);
}

function addLogLine(rawtext, options = { bold: false, italic: false, logscore: false }) {
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

            createLogLine(linecss, td1content, 'logtime', useFormatting(line), 'logtext', !showScoreLogLine);
            parseSingleLogLine(line); // may scroll even more
        });
        if (showScoreLogLine) addScoreLogLine();
        if (!restoring) {
            db.setKeyValue('log', logger.outerHTML.normalize());
            disableSessionControlButtons();
        }
    }
    setFocus();
}

function addScoreLogLine() {
    createLogLine('loglinescores', '&nbsp;', 'logtime', getScoreText(), 'logscore', true);
}

function createLogLine(linecss, col1content, col1css, col2content, col2css, scrollIntoView = false) {
    let tr = document.createElement('tr');
    addToClassList(tr, linecss);

    let td1 = document.createElement('td');
    td1.innerHTML = col1content;
    addToClassList(td1, col1css);

    let td2 = document.createElement('td');
    td2.innerHTML = col2content;
    addToClassList(td2, col2css);

    tr.appendChild(td1);
    tr.appendChild(td2);
    let logLines = document.getElementById('Loglines');
    logLines.appendChild(tr);

    showScoreLogLine = false;
    if (scrollIntoView) tr.scrollIntoView();
}

function addToClassList(to, css) {
    if (css) {
        if (Array.isArray(css)) {
            css.forEach((c) => { to.classList.add(c) });
        }
        else {
            to.classList.add(css);
        };
    }
}

function getScoreText() {
    let scoretext = (currentHP > 0) ? `Current hit points: ${currentHP}.` : (maxHP > 0) ? `${statblockName} is unconscious (0 hit points).` : `${statblockName} is dead.`;
    if (currentTempHP > 0) scoretext = `${scoretext} Temporary hit points: ${currentTempHP}.`;
    if ((currentHP > 0) && (currentTempHP > 0)) scoretext = `${scoretext} Total hit points: ${currentHP + currentTempHP}.`;
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
    setSessionNo(Number.parseInt(line.replace(regex, "$1")));
}

function addLoggerStyle() {
    let style = document.createElement('style');
    style.setAttribute("type", "text/css");
    style.innerHTML = loggerStyle();
    logger.insertAdjacentElement('beforebegin', style);
}
//#endregion Loghandling

//#region Controls
function addControlsManualInput(controls) {
    // input text + submit button
    let i = document.createElement('textarea');
    i.setAttribute("cols", "100");
    i.setAttribute("rows", "3");
    i.setAttribute('title', 'Type text here to be added to the log.')
    i.classList.add('textinput');
    i.id = 'textinput';
    controls.appendChild(i);

    addManualInputHints(controls);

    let b = inputButton('log', 'l', 'Send the text to the log.', 'textinput');
    b.addEventListener('click', () => { submitManualLog(); });
    controls.appendChild(b);
}

function addManualInputHints(controls) {
    let p = document.createElement('p');
    p.classList.add('hints');
    p.innerHTML = 'HINTS: use <strong>damage</strong>, <strong>heal</strong>, <strong>temphp</strong>, <strong>session</strong>, each followed by a number. Or use <strong>hp</strong>. Enclose text in * for bold, or in _ for italic.';
    controls.appendChild(p);
}

function addControlsDownloadLog(controls) {
    // download log button; shortcutkey d is not available, use h
    let d = inputButton('download', 'h', 'Download the log as a StatblockWizard log html file.');
    d.classList.add('tooling');
    controls.appendChild(d);
    d.addEventListener('click', () => {
        let sessionno = getSessionNo();
        let sdt = logger.getAttribute("startdatetime");
        let dt = `${sdt.substring(8, 10)}-${sdt.substring(5, 7)}-${sdt.substring(0, 4)}`;
        let htmldoc = document.implementation.createHTMLDocument(`${statblockName} Log#${sessionno} - ${dt}`);
        htmldoc = createLogDownloadDocument(htmldoc);
        downloadDocumentHTML(htmldoc, `${statblockName} Log#${sessionno} - ${dt}`);
    });
}

function addControlsOpenLog(controls) {
    let selhtml = inputFile('.statblockwizard.log.html');
    if (selhtml) {
        selhtml.addEventListener('change', function () {
            var fr = new FileReader();
            fr.onload = function () { processHTMLFile(fr.result) }
            if (this.files[0] != '') {
                fr.readAsText(this.files[0])
                this.value = ''
                this.content = ''
            }
        })
    }
    let uphtml = inputButton('upload', 'u', 'Upload a StatblockWizard log html file.');
    uphtml.classList.add('tooling');
    controls.appendChild(uphtml);
    uphtml.addEventListener('click', () => {
        selhtml.click();
    });
}

function addControlsOpenSVG(controls) {
    let selsvg = inputFile('.statblockwizard.svg');
    if (selsvg) {
        selsvg.addEventListener('change', function () {
            var fr = new FileReader();
            fr.onload = function () { processSVGFile(fr.result) }
            if (this.files[0] != '') {
                fr.readAsText(this.files[0])
                this.value = ''
                this.content = ''
            }
        })
    }
    let upsvg = inputButton('open statblock', 'o', 'Open a StatblockWizard SVG file.');
    upsvg.classList.add('tooling');
    controls.appendChild(upsvg);
    upsvg.addEventListener('click', () => {
        selsvg.click();
    });
}

function addControlsRestoreLastSession(controls) {
    let r = inputButton('restore last session', 'r', 'Restore the last session.');
    r.setAttribute('id', 'restore');
    r.classList.add('tooling');
    controls.appendChild(r);
    r.addEventListener('click', () => {
        resetLog();
        restoreLastSession();
    });
}

function addNewSessionFromRestoredCurrent(controls) {
    let n = inputButton('new session using current data', 'n', 'Start a new session, retaining current statblock and data.');
    n.setAttribute('id', 'newsession');
    n.setAttribute('disabled', true); // will only be enabled directly after restoring a log or last session.
    n.classList.add('tooling');
    controls.appendChild(n);
    n.addEventListener('click', () => {
        continueFromLastSession();
    });
}
//#endregion Controls

//#region tooling
function fileTypeSupported(name) {
    return (name.toLocaleLowerCase().endsWith('.statblockwizard.svg') || name.toLocaleLowerCase().endsWith('.statblockwizard.log.html'))
}

function processSupportedFile(fileContent) {
    let svg = fileContent.indexOf('<svg ');
    let html = fileContent.indexOf('<html ');

    if (svg >= 0 && html < 0) processSVGFile(fileContent);
    if (svg > html && html >= 0) processHTMLFile(fileContent);
}

function inputButton(text, accessKey, alt, classname) {
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

function inputFile(accept) {
    let input = document.createElement('input');
    input.setAttribute("type", "file");
    if (accept) input.setAttribute('accept', accept);
    return input;
}

function submitManualLog() {
    let t = document.getElementById('textinput');
    if (t) {
        addLogLine(t.value);
        t.value = '';
        t.focus();
    }
}

function createLogDownloadDocument(htmldoc = new Document) {
    htmldoc.documentElement.setAttribute("lang", "en");

    let style = downloadedLogStyle() + loggerStyle();
    htmldoc.head.insertAdjacentHTML("beforeend", `<style>${style}</style>`);

    let body = `<h1 class="appinfo">${statblockName} Log #${getSessionNo()} Transcript</h1>` +
        '<div id="Statblock" class="appinfo">' + db.getKeyValue('statblock') + '</div>' +
        db.getKeyValue('log') + '<!--endlog-->';
    htmldoc.body.innerHTML = body;

    return htmldoc;
}

function downloadDocumentHTML(htmldoc, filename) {
    const file = new Blob(['<!DOCTYPE html>' + '\n' + htmldoc.documentElement.outerHTML], { type: 'text/html' });
    const fileURL = URL.createObjectURL(file);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', fileURL);
    linkElement.setAttribute('download', `${filename}.statblockwizard.log.html`);
    linkElement.click();
    enableNewSessionButton();
}

function resetLog() {
    logger.innerHTML = emptyLogHtml();
}

function restoreLastSession() {
    restoring = true;
    let filecontent = db.getKeyValue('statblock');
    processSVGFile(filecontent);
    let logcontent = db.getKeyValue('log');
    if (logcontent) logger.outerHTML = logcontent;
    logger = document.getElementById('Log');
    getStatusFromLog();
    disableSessionControlButtons();
    restoring = false;
    enableNewSessionButton();
}

function processHTMLFile(HTMLFileContent) {
    restoring = true;
    resetLog();
    let start = HTMLFileContent.indexOf('<svg');
    let end = HTMLFileContent.indexOf('</svg>') + 6;
    let fileContent = HTMLFileContent.substring(start, end);

    start = HTMLFileContent.indexOf('<div id="Log"');
    end = HTMLFileContent.indexOf('<!--endlog-->');
    let logContent = HTMLFileContent.substring(start, end);

    db.setKeyValue('statblock', fileContent);
    db.setKeyValue('log', logContent);
    restoreLastSession();
}

function disableSessionControlButtons() {
    let restore = document.getElementById('restore');
    if (restore) restore.setAttribute('disabled', true);
    let newsession = document.getElementById('newsession');
    if (newsession) newsession.setAttribute('disabled', true);
}

function enableNewSessionButton() {
    let newsession = document.getElementById('newsession');
    if (newsession) newsession.removeAttribute('disabled');
}

function continueFromLastSession() {
    resetLog();
    logStartSession();
    disableSessionControlButtons();
}

function useFormatting(line) {
    line = useFormattingRegex(line, /(^|[^_]])_\*([^\*]+)\*_([^_]|$)|(^|[^\*])\*_([^_]+)_\*([^\*]|$)/g, useFormattingBoldItalic); // code must execute before bold or italic
    line = useFormattingRegex(line, /(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, useFormattingBold);
    line = useFormattingRegex(line, /(^|[^_])_([^_]+)_([^_]|$)/g, useFormattingItalic);
    line = useFormattingRegex(line, /\*(\*)|_(_)/g, useFormattingUnDouble);
    return line;
}

function useFormattingRegex(line, regex, handler) {
    if (regex.test(line)) return handler(line, regex);
    return line; //unchanged
}

function useFormattingBold(line, regex) {
    return line.replace(regex, '$1<span class="bold">$2</span>$3');
}

function useFormattingItalic(line, regex) {
    return line.replace(regex, '$1<span class="italic">$2</span>$3');
}

function useFormattingBoldItalic(line, regex) {
    return line.replace(regex, '$1$4<span class="bold italic">$2$5</span>$3$6');
}

function useFormattingUnDouble(line, regex) {
    return line.replace(regex, '$1$2');
}
//#endregion tooling