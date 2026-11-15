(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.I18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DICT = {
    en: {
      'home.eyebrow': 'Sourdough, planned backwards',
      'home.title': 'When do you want your bread?',
      'home.lede': 'Tell me when it should be on the table. I plan everything backwards, from the first feed to the first slice.',
      'home.ready': 'Bread ready',
      'home.feeds': 'Starter feeds',
      'home.dough': 'Dough',
      'home.details': 'Details',
      'home.temp': 'House temperature',
      'home.tempHint': 'The warmer it is, the faster everything goes.',
      'home.quiet': 'No steps at night',
      'home.from': 'from',
      'home.to': 'to',
      'home.plan': 'Plan my bake',
      'home.startNow': 'If I start now',
      'home.startNowResult': 'Starting now, your bread is ready {day} at {t}.',
      'home.startNowGo': 'Start now',
      'home.startNowLater': 'Starting now does not fit your rest hours. The best moment for the first feed is {sd} at {st}, and your bread is ready {day} at {t}.',
      'home.startNowGoLater': 'Plan it',

      'now.next': 'Next step',
      'now.due': 'Do it now',
      'now.hours': 'Hours',
      'now.minutes': 'Minutes',
      'now.seconds': 'Seconds',
      'now.starts': 'Starts {day} at {t}',
      'now.latest': 'Latest by {t}',
      'now.late': 'Past the latest time, do it as soon as you can',
      'now.progress': '{p}% of your bake is behind you',
      'now.done': 'Done now',
      'now.plan': 'Full plan',
      'now.edit': 'Edit',
      'now.finished': 'Your bread is ready. Enjoy it.',
      'now.how': 'How to tell it is time',

      'plan.eyebrow': 'Your plan',
      'plan.starts': 'It starts {day} at {t}.',
      'plan.allDone': 'Everything is done.',
      'plan.back': 'Back',
      'plan.reset': 'Reset the plan',
      'plan.calendar': 'Add to calendar',
      'ics.ready': 'Bread ready',
      'ics.latest': 'Latest by {t}',
      'toast.calendar': 'Calendar file ready. Open it to add every step with alarms.',
      'plan.resetConfirm': 'Clear the steps marked as done and recalculate?',
      'plan.rest': 'Rest, {a} – {b}',
      'chip.by': 'by {t}',
      'chip.exact': 'exact time',
      'chip.then': 'then {d}',
      'chip.done': 'done',
      'chip.long': 'longer than usual',
      'chip.short': 'shorter than usual',
      'act.done': 'Done now',
      'act.undo': 'Undo',
      'step.how': 'How to tell it is time: ',

      'notice.moved': 'That time does not fit your rest hours or the current time. The closest option is {day} at {t}, {d} {dir}.',
      'notice.later': 'later',
      'notice.earlier': 'earlier',
      'notice.over': 'The previous step ran past its maximum time. Check your starter before going on.',
      'notice.none': 'I cannot find a workable time within 36 hours. Try switching off the night break or picking another time.',
      'toast.impossible': 'With that timing the bread cannot be finished within 36 hours. The step was not marked.',
      'toast.moved': 'Your bread moves to {day} at {t}.',

      'lang.label': 'Language',
      'credit.photo': 'Photo'
    },
    it: {
      'home.eyebrow': 'Pane a lievito madre, pianificato a ritroso',
      'home.title': 'Quando vuoi il tuo pane?',
      'home.lede': 'Dimmi quando lo vuoi in tavola. Al resto penso io, dal primo rinfresco alla prima fetta.',
      'home.ready': 'Pane pronto',
      'home.feeds': 'Rinfreschi del lievito',
      'home.dough': 'Impasto',
      'home.details': 'Dettagli',
      'home.temp': 'Temperatura di casa',
      'home.tempHint': 'Più fa caldo, più i tempi si accorciano.',
      'home.quiet': 'Nessun passo di notte',
      'home.from': 'dalle',
      'home.to': 'alle',
      'home.plan': 'Pianifica',
      'home.startNow': 'Se parto ora',
      'home.startNowResult': 'Se parti ora, il pane è pronto {day} alle {t}.',
      'home.startNowGo': 'Parto ora',
      'home.startNowLater': 'Partire adesso non rispetta le ore di riposo. Il momento migliore per il primo rinfresco è {sd} alle {st}, e il pane è pronto {day} alle {t}.',
      'home.startNowGoLater': 'Pianifica',

      'now.next': 'Prossimo passo',
      'now.due': 'Fallo adesso',
      'now.hours': 'Ore',
      'now.minutes': 'Minuti',
      'now.seconds': 'Secondi',
      'now.starts': 'Inizia {day} alle {t}',
      'now.latest': 'Entro le {t}',
      'now.late': 'Oltre l’orario limite, fallo appena puoi',
      'now.progress': '{p}% del tuo pane è alle spalle',
      'now.done': 'Fatto ora',
      'now.plan': 'Piano completo',
      'now.edit': 'Modifica',
      'now.finished': 'Il tuo pane è pronto. Buon appetito.',
      'now.how': 'Come capire che è ora',

      'plan.eyebrow': 'Il tuo piano',
      'plan.starts': 'Si parte {day} alle {t}.',
      'plan.allDone': 'Tutti i passi sono fatti.',
      'plan.back': 'Indietro',
      'plan.reset': 'Ricomincia il piano',
      'plan.calendar': 'Aggiungi al calendario',
      'ics.ready': 'Pane pronto',
      'ics.latest': 'Entro le {t}',
      'toast.calendar': 'File del calendario pronto. Aprilo per aggiungere ogni passo con le sveglie.',
      'plan.resetConfirm': 'Cancello i passi segnati come fatti e ricalcolo il piano?',
      'plan.rest': 'Riposo, {a} – {b}',
      'chip.by': 'entro le {t}',
      'chip.exact': 'puntuale',
      'chip.then': 'poi {d}',
      'chip.done': 'fatto',
      'chip.long': 'più lungo del solito',
      'chip.short': 'più corto del solito',
      'act.done': 'Fatto ora',
      'act.undo': 'Annulla',
      'step.how': 'Come capire che è ora: ',

      'notice.moved': 'L’orario richiesto non è compatibile con le ore di riposo o con l’ora attuale. Il più vicino fattibile è {day} alle {t}, cioè {d} {dir}.',
      'notice.later': 'più tardi',
      'notice.earlier': 'prima',
      'notice.over': 'Il passo precedente ha superato la durata massima prevista. Controlla il lievito prima di proseguire.',
      'notice.none': 'Non trovo un orario fattibile entro 36 ore. Prova a togliere la finestra notturna o a scegliere un altro orario.',
      'toast.impossible': 'Con questo orario il pane non si può chiudere entro 36 ore. Il passo non è stato segnato.',
      'toast.moved': 'Il pane slitta a {day} alle {t}.',

      'lang.label': 'Lingua',
      'credit.photo': 'Foto'
    }
  };

  var LOCALES = { en: 'en-GB', it: 'it-IT' };
  var lang = 'en';

  function set(l) { if (DICT[l]) lang = l; return lang; }
  function get() { return lang; }
  function locale() { return LOCALES[lang]; }

  function t(key, vars) {
    var s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  // picks the right language from an { en, it } object
  function L(o) { return o && typeof o === 'object' ? (o[lang] || o.en) : o; }

  return { set: set, get: get, locale: locale, t: t, L: L, DICT: DICT };
});
