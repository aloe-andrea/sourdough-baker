(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./calc.js'), require('./recipeimport.js'));
  else root.Recipe = factory(root.Calc, root.RecipeImport);
})(typeof self !== 'undefined' ? self : this, function (Calc, RecipeImport) {
  'use strict';

  // Each step is a moment when you act. Its duration is the time until the next step
  // (the last step ends when the bread is ready). Durations in minutes, at 24 C.
  // sensibileTemperatura: scales with house temperature.
  function d(min, target, max) { return { min: min, target: target, max: max }; }
  function tx(en, it) { return { en: en, it: it }; }

  var STEP = {
    rinfresco11: {
      id: 'rinfresco-1-1', ratio: 1, tipo: 'attesa', durata: d(360, 420, 480), sensibileTemperatura: true, foto: 'starter',
      nome: tx('Feed 1:1', 'Rinfresco 1:1'),
      istruzioni: tx('Take the starter out of the fridge and feed it 1:1. Cover loosely and leave at room temperature.',
                     'Togli il lievito madre dal frigo e rinfrescalo nel rapporto 1:1. Copri senza chiudere ermetico e lascia a temperatura ambiente.'),
      segnale: tx('Doubled, domed top with bubbles.', 'Raddoppiato, superficie bombata con bolle.')
    },
    rinfresco12: {
      id: 'rinfresco-1-2', ratio: 2, tipo: 'attesa', durata: d(180, 210, 240), sensibileTemperatura: true, foto: 'starter',
      nome: tx('Feed 1:2', 'Rinfresco 1:2'),
      istruzioni: tx('Feed at a 1:2 ratio. Mark the level on the jar with a rubber band.',
                     'Rinfresca nel rapporto 1:2. Segna il livello sul vasetto con un elastico.'),
      segnale: tx('Doubled, bubbles on top and along the glass.', 'Raddoppiato, bolle in superficie e al bordo del vasetto.')
    },
    rinfresco12a: {
      id: 'rinfresco-1-2-a', ratio: 2, tipo: 'attesa', durata: d(360, 420, 480), sensibileTemperatura: true, foto: 'starter',
      nome: tx('Feed 1:2', 'Rinfresco 1:2'),
      istruzioni: tx('Take the starter out of the fridge and feed it 1:2. Cover loosely and leave at room temperature.',
                     'Togli il lievito madre dal frigo e rinfrescalo nel rapporto 1:2. Copri senza chiudere ermetico e lascia a temperatura ambiente.'),
      segnale: tx('Doubled, domed top with bubbles.', 'Raddoppiato, superficie bombata con bolle.')
    },
    rinfresco12b: {
      id: 'rinfresco-1-2-bis', ratio: 2, tipo: 'attesa', durata: d(180, 210, 240), sensibileTemperatura: true, foto: 'starter',
      nome: tx('Second feed 1:2', 'Secondo rinfresco 1:2'),
      istruzioni: tx('Feed again at 1:2 once the starter has doubled.', 'Rinfresca ancora nel rapporto 1:2 quando il lievito ha raddoppiato.'),
      segnale: tx('Doubled, smells of yogurt, not sharply sour.', 'Raddoppiato, profumo di yogurt, non acido pungente.')
    },
    rinfrescoUnico: {
      id: 'rinfresco-unico', ratio: 2, tipo: 'attesa', durata: d(360, 480, 600), sensibileTemperatura: true, foto: 'starter',
      nome: tx('Feed 1:2 from the fridge', 'Rinfresco 1:2 dal frigo'),
      istruzioni: tx('Take the starter out of the fridge and feed it 1:2. Cover and leave at room temperature.',
                     'Togli il lievito dal frigo e rinfrescalo nel rapporto 1:2. Copri e lascia a temperatura ambiente.'),
      segnale: tx('Doubled, bubbles on top. Use it at the peak, before it collapses.', 'Raddoppiato, bolle in superficie. Usalo al picco, prima che si afflosci.')
    },
    autolisi: {
      id: 'autolisi', tipo: 'attesa', durata: d(30, 45, 60), sensibileTemperatura: true, foto: 'impasto',
      nome: tx('Autolyse', 'Autolisi'),
      istruzioni: tx('Mix flour and water, no starter and no salt. Cover and rest.', 'Mescola farina e acqua, senza lievito e senza sale. Copri e lascia riposare.'),
      segnale: tx('Dough is hydrated and a little stretchy. Meanwhile the starter reaches its peak.',
                  'Impasto idratato e un po’ estensibile. Nel frattempo il lievito arriva al picco.')
    },
    impasto: {
      id: 'impasto', tipo: 'attivo', durata: d(30, 30, 45), sensibileTemperatura: false, foto: 'impasto',
      nome: tx('Mix in starter and salt', 'Impasto con lievito e sale'),
      istruzioni: tx('Add the starter at its peak, then the salt. Mix until the dough is even.', 'Aggiungi il lievito al picco e poi il sale. Impasta fino a un composto omogeneo.'),
      segnale: tx('Even dough. Note the final temperature, ideally 24-26 °C.', 'Impasto omogeneo. Annota la temperatura finale, ideale 24-26 °C.')
    },
    piega1: {
      id: 'piega-1', tipo: 'attivo', durata: d(30, 30, 45), sensibileTemperatura: true, foto: 'pieghe',
      nome: tx('Fold 1', 'Piega 1'),
      istruzioni: tx('With a wet hand, lift and fold the four sides of the dough towards the centre.', 'Con la mano bagnata, solleva e ripiega i quattro lati dell’impasto verso il centro.'),
      segnale: tx('The dough tightens and resists a little more.', 'L’impasto si tende e resiste un po’ di più.')
    },
    piega2: {
      id: 'piega-2', tipo: 'attivo', durata: d(30, 30, 45), sensibileTemperatura: true, foto: 'pieghe',
      nome: tx('Fold 2', 'Piega 2'),
      istruzioni: tx('Second fold, same technique, gently.', 'Seconda piega, stessa tecnica, con delicatezza.'),
      segnale: tx('Smoother dough that starts to puff up.', 'L’impasto è più liscio e inizia a gonfiarsi.')
    },
    piega3: {
      id: 'piega-3', tipo: 'attivo', durata: d(30, 30, 45), sensibileTemperatura: true, foto: 'pieghe',
      nome: tx('Fold 3', 'Piega 3'),
      istruzioni: tx('Third and last fold. Then let it ferment without touching it.', 'Terza e ultima piega. Poi lascia fermentare senza toccare.'),
      segnale: tx('Elastic, silky dough.', 'Impasto elastico e setoso.')
    },
    massa: {
      id: 'fermentazione', tipo: 'attesa', durata: d(120, 180, 240), sensibileTemperatura: true, foto: 'bulk',
      nome: tx('Bulk fermentation', 'Fermentazione di massa'),
      istruzioni: tx('Rest covered at room temperature.', 'Lascia riposare coperto a temperatura ambiente.'),
      segnale: tx('Volume up 50-75%, domed edges, bubbles on the surface.', 'Volume aumentato del 50-75%, bordi bombati, bolle visibili in superficie.')
    },
    preforma: {
      id: 'preforma', tipo: 'attivo', durata: d(20, 25, 40), sensibileTemperatura: false, foto: 'forma',
      nome: tx('Pre-shape', 'Pre-forma'),
      istruzioni: tx('Turn the dough onto a floured surface and fold it into a soft round. Rest it uncovered.', 'Rovescia l’impasto sul piano infarinato e ripiegalo in una palla morbida. Lascia riposare scoperto.'),
      segnale: tx('A relaxed, spread-out round.', 'Palla distesa e rilassata.')
    },
    formatura: {
      id: 'formatura', tipo: 'attesa', durata: d(480, 660, 840), sensibileTemperatura: false, foto: 'frigo',
      nome: tx('Shape and chill', 'Formatura e frigo'),
      istruzioni: tx('Shape the loaf, place it in a floured basket and put it in the fridge, covered.', 'Dai la forma finale, sistema nel cestino infarinato e metti in frigo coperto.'),
      segnale: tx('Taut surface, well-sealed seam.', 'Superficie tesa, cucitura ben chiusa.')
    },
    forno: {
      id: 'forno', tipo: 'attesa', durata: d(45, 45, 60), sensibileTemperatura: false, foto: 'forno',
      nome: tx('Heat the oven', 'Accendi il forno'),
      istruzioni: tx('Heat the oven to 250 °C with the pot inside, for at least 45 minutes.', 'Accendi il forno a 250 °C con la pentola dentro, per almeno 45 minuti.'),
      segnale: tx('Oven and pot are properly hot.', 'Forno e pentola ben caldi.')
    },
    cottura: {
      id: 'cottura', tipo: 'attesa', durata: d(40, 45, 50), sensibileTemperatura: false, foto: 'cottura',
      nome: tx('Bake', 'Cottura'),
      istruzioni: tx('Score the loaf and bake it in the covered pot at 250 °C for 20 minutes. Then uncover and bake at 200-210 °C for 20-25 minutes.',
                     'Incidi il pane e inforna nella pentola coperta a 250 °C per 20 minuti. Poi scopri e prosegui a 200-210 °C per 20-25 minuti.'),
      segnale: tx('Dark, well-caramelised crust and a hollow sound when you tap the base.', 'Crosta scura e ben caramellata, suono vuoto se bussi sotto.')
    },
    raffreddamento: {
      id: 'raffreddamento', tipo: 'attesa', durata: d(45, 60, 90), sensibileTemperatura: false, foto: 'pane',
      nome: tx('Cool', 'Raffreddamento'),
      istruzioni: tx('Take it out and cool on a rack. The crumb finishes setting inside, so do not slice it yet.', 'Sforna e lascia raffreddare su una griglia. Il pane finisce di cuocere dentro, non tagliarlo subito.'),
      segnale: tx('Your bread is ready: a crust that crackles, a dry crumb.', 'Il pane è pronto: crosta che canta, mollica asciutta.')
    }
  };

  // Extra steps for doughs without folds: lean bread kneaded once, and brioche
  STEP.impastoSenza = {
    id: 'impasto-senza', tipo: 'attesa', durata: d(240, 330, 450), sensibileTemperatura: true, foto: 'bulk',
    nome: tx('Knead and let it rise', 'Impasta e lascia lievitare'),
    istruzioni: tx('Add the starter at its peak, then the salt, and knead until smooth. Cover and leave at room temperature, with no folds.',
                   'Aggiungi il lievito al picco e poi il sale, e impasta fino a un composto liscio. Copri e lascia a temperatura ambiente, senza pieghe.'),
    segnale: tx('Volume up 50-75%, domed top, bubbles on the surface.', 'Volume aumentato del 50-75%, superficie bombata, bolle visibili.')
  };
  STEP.impastoBrioche = {
    id: 'impasto-brioche', tipo: 'attivo', durata: d(30, 40, 60), sensibileTemperatura: false, foto: 'impasto',
    nome: tx('Knead with butter and eggs', 'Impasta con burro e uova'),
    istruzioni: tx('Mix flour, eggs, sugar and the starter at its peak. Knead until the dough pulls away from the bowl, then add the soft butter a little at a time and keep kneading.',
                   'Mescola farina, uova, zucchero e il lievito al picco. Impasta finché l’impasto si stacca dalla ciotola, poi aggiungi il burro morbido a poco a poco e continua a impastare.'),
    segnale: tx('Smooth, glossy and stretchy: a small piece stretches into a thin window without tearing.', 'Liscio, lucido ed elastico: un pezzetto si stende in una pellicola sottile senza strapparsi.')
  };
  STEP.rialzoBrioche = {
    id: 'rialzo-brioche', tipo: 'attesa', durata: d(180, 270, 420), sensibileTemperatura: true, foto: 'bulk',
    nome: tx('First rise', 'Prima lievitazione'),
    istruzioni: tx('Cover and leave at room temperature. Do not fold.', 'Copri e lascia a temperatura ambiente. Non fare pieghe.'),
    segnale: tx('The dough has grown by half and feels airy and soft.', 'L’impasto è cresciuto della metà ed è soffice e leggero.')
  };
  STEP.formaBrioche = {
    id: 'formatura-brioche', tipo: 'attesa', durata: d(480, 600, 840), sensibileTemperatura: false, foto: 'frigo',
    nome: tx('Shape and chill', 'Formatura e frigo'),
    istruzioni: tx('Shape the brioche, place it in the buttered tin or on a tray, cover and put it in the fridge.',
                   'Dai la forma alla brioche, mettila nello stampo imburrato o su una teglia, copri e metti in frigo.'),
    segnale: tx('Shaped and tucked in, resting cold.', 'Formata e coperta, a riposare al freddo.')
  };
  STEP.provaBrioche = {
    id: 'prova-brioche', tipo: 'attesa', durata: d(60, 105, 180), sensibileTemperatura: true, foto: 'forma',
    nome: tx('Final proof', 'Lievitazione finale'),
    istruzioni: tx('Take the brioche out of the fridge and leave it covered at room temperature until puffy.',
                   'Togli la brioche dal frigo e lasciala coperta a temperatura ambiente finché è gonfia.'),
    segnale: tx('Puffy, nearly doubled, and a gentle press leaves a slow-fading dent.', 'Gonfia, quasi raddoppiata, e una leggera pressione lascia un’impronta che torna piano.')
  };
  STEP.cotturaBrioche = {
    id: 'cottura-brioche', tipo: 'attesa', durata: d(30, 38, 45), sensibileTemperatura: false, foto: 'cottura',
    nome: tx('Bake', 'Cottura'),
    istruzioni: tx('Brush with egg wash and bake at 180 °C for 30-40 minutes, until deep golden. Cover with foil if it browns too fast.',
                   'Spennella con l’uovo sbattuto e cuoci a 180 °C per 30-40 minuti, finché è ben dorata. Copri con alluminio se scurisce troppo in fretta.'),
    segnale: tx('Deep golden crust and a hollow sound when you tap the base.', 'Crosta dorata intensa e suono vuoto se bussi sotto.')
  };

  var METHODS = {
    pieghe: {
      nome: tx('Sourdough bread, with folds', 'Pane a lievito madre, con pieghe'),
      breve: tx('With folds', 'Con pieghe'),
      descrizione: tx('Autolyse, three folds, bulk fermentation, a night in the fridge.', 'Autolisi, tre pieghe, fermentazione di massa, una notte in frigo.'),
      passi: ['autolisi', 'impasto', 'piega1', 'piega2', 'piega3', 'massa', 'preforma', 'formatura', 'forno', 'cottura', 'raffreddamento']
    },
    senza: {
      nome: tx('Sourdough bread, no folds', 'Pane a lievito madre, senza pieghe'),
      breve: tx('No folds', 'Senza pieghe'),
      descrizione: tx('Knead once, one long rise, then shape and chill.', 'Si impasta una volta, un’unica lievitazione, poi formatura e frigo.'),
      passi: ['autolisi', 'impastoSenza', 'preforma', 'formatura', 'forno', 'cottura', 'raffreddamento']
    },
    brioche: {
      nome: tx('Brioche or enriched dough', 'Brioche o impasto arricchito'),
      breve: tx('Brioche', 'Brioche'),
      descrizione: tx('Knead with butter and eggs, no folds, shape, chill, final proof.', 'Impasto con burro e uova, senza pieghe, formatura, frigo, lievitazione finale.'),
      passi: ['impastoBrioche', 'rialzoBrioche', 'formaBrioche', 'provaBrioche', 'forno', 'cotturaBrioche', 'raffreddamento']
    }
  };

  var PRESETS = {
    'uno11-uno12': {
      nome: tx('Feed 1:1, then 1:2', 'Rinfresco 1:1 poi 1:2'),
      breve: tx('1:1 then 1:2', '1:1 poi 1:2'),
      descrizione: tx('From the fridge: 1:1, then 1:2 at the double. The classic overnight.', 'Dal frigo: 1:1, al raddoppio 1:2. Il classico notturno.'),
      rinfreschi: ['rinfresco11', 'rinfresco12']
    },
    'due12': {
      nome: tx('Two 1:2 feeds', 'Due rinfreschi 1:2'),
      breve: tx('1:2 twice', '1:2 due volte'),
      descrizione: tx('Start with 1:2 from the fridge, then feed 1:2 again at the double.', 'Parti con 1:2 dal frigo e ripeti 1:2 al raddoppio.'),
      rinfreschi: ['rinfresco12a', 'rinfresco12b']
    },
    'singolo': {
      nome: tx('A single 1:2 feed', 'Un solo rinfresco 1:2'),
      breve: tx('Single 1:2', '1:2 singolo'),
      descrizione: tx('One feed from the fridge. Faster, a less active starter.', 'Un unico rinfresco dal frigo. Più veloce, lievito meno attivo.'),
      rinfreschi: ['rinfrescoUnico']
    }
  };


  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function buildRecipe(presetId, methodId) {
    var preset = PRESETS[presetId] || PRESETS['uno11-uno12'];
    var method = METHODS[methodId] || METHODS.pieghe;
    return preset.rinfreschi.concat(method.passi).map(function (k) { return clone(STEP[k]); });
  }


  // ---------- steps from an imported recipe ----------
  function T(en, it) { return tx(en, it); }
  function pick(o) { return { nome: o.nome, istruzioni: o.istruzioni, segnale: o.segnale }; }

  function phaseStep(spec, ctx) {
    var ph = spec.phase, st;
    switch (ph) {
      case 'autolyse': st = Object.assign(pick(STEP.autolisi), { tipo: 'attesa', sens: true, foto: 'impasto' }); break;
      case 'mix':
        st = { nome: T('Mix the dough', 'Impasta'), tipo: ctx.folds ? 'attivo' : 'attesa', sens: !ctx.folds, foto: 'impasto',
               istruzioni: T('Mix the dough as the recipe says, then cover it.', 'Impasta come indica la ricetta, poi copri.'),
               segnale: ctx.folds ? STEP.impasto.segnale : STEP.massa.segnale };
        break;
      case 'fold':
        st = { nome: T('Fold ' + spec.index, 'Piega ' + spec.index), tipo: 'attivo', sens: true, foto: 'pieghe',
               istruzioni: STEP.piega1.istruzioni, segnale: spec.index < ctx.folds ? STEP.piega2.segnale : STEP.massa.segnale };
        break;
      case 'preshape': st = Object.assign(pick(STEP.preforma), { tipo: 'attivo', sens: false, foto: 'forma' }); break;
      case 'shape':
        st = ctx.chill ? Object.assign(pick(STEP.formatura), { tipo: 'attesa', sens: false, foto: 'frigo' })
                       : { nome: T('Shape', 'Formatura'), tipo: 'attesa', sens: true, foto: 'forma',
                           istruzioni: T('Shape the loaf and place it in a floured basket or tin. Cover it.', 'Dai la forma al pane e mettilo in un cestino infarinato o in uno stampo. Copri.'),
                           segnale: T('Puffy, and a gentle press leaves a dent that fades slowly.', 'Gonfio, e una leggera pressione lascia un’impronta che torna piano.') };
        break;
      case 'proof':
        st = { nome: T('Final proof', 'Lievitazione finale'), tipo: 'attesa', sens: true, foto: 'forma',
               istruzioni: ctx.chill ? STEP.provaBrioche.istruzioni : T('Leave it covered at room temperature until puffy.', 'Lascia coperto a temperatura ambiente finché è gonfio.'),
               segnale: STEP.provaBrioche.segnale };
        break;
      case 'preheat':
        st = { nome: T('Heat the oven', 'Accendi il forno'), tipo: 'attesa', sens: false, foto: 'forno',
               istruzioni: spec.tempC ? T('Heat the oven to ' + spec.tempC + ' °C.', 'Accendi il forno a ' + spec.tempC + ' °C.') : STEP.forno.istruzioni,
               segnale: STEP.forno.segnale };
        break;
      case 'bake':
        st = { nome: T('Bake', 'Cottura'), tipo: 'attesa', sens: false, foto: 'cottura',
               istruzioni: spec.tempC ? T('Bake at ' + spec.tempC + ' °C as the recipe says.', 'Cuoci a ' + spec.tempC + ' °C come indica la ricetta.') : STEP.cottura.istruzioni,
               segnale: STEP.cottura.segnale };
        break;
      default: st = Object.assign(pick(STEP.raffreddamento), { tipo: 'attesa', sens: false, foto: 'pane' });
    }
    return st;
  }

  // flour and water go in the autolyse when there is one; everything else goes in the mix
  function gramsFor(phase, ing, hasAutolyse) {
    var inA = function (i) { return i.type === 'flour' || i.type === 'water'; };
    if (phase === 'autolyse') return ing.filter(inA);
    if (phase === 'mix') return hasAutolyse ? ing.filter(function (i) { return !inA(i); }) : ing;
    return [];
  }

  // opts: { loafG }  ->  { steps, ingredients (scaled), feeds, starterG, scale }
  function fromImported(recipe, presetId, opts) {
    opts = opts || {};
    var preset = PRESETS[presetId] || PRESETS['uno11-uno12'];
    var total = Calc.totalWeight(recipe.ingredients);
    var loaf = opts.loafG > 0 ? opts.loafG : total;
    var ing = Calc.scaleTo(recipe.ingredients, loaf);
    var starterG = ing.reduce(function (a, i) { return a + (i.type === 'starter' ? i.g : 0); }, 0);

    var feedSteps = preset.rinfreschi.map(function (k) { return clone(STEP[k]); });
    var fed = Calc.feeds(starterG, feedSteps.map(function (f) { return f.ratio; }));
    feedSteps.forEach(function (f, i) {
      if (fed[i]) f.grammi = [{ key: 'starter', g: fed[i].starter }, { key: 'flour', g: fed[i].flour }, { key: 'water', g: fed[i].water }];
    });

    var specs = RecipeImport.assemble(recipe);
    var ctx = { folds: specs.filter(function (x) { return x.phase === 'fold'; }).length, chill: specs.some(function (x) { return x.phase === 'shape'; }) && recipe.steps.some(function (x) { return x.phase === 'chill'; }) };
    var hasAutolyse = specs.some(function (x) { return x.phase === 'autolyse'; });
    var steps = specs.map(function (sp, i) {
      var st = phaseStep(sp, ctx);
      var g = gramsFor(sp.phase, ing, hasAutolyse).filter(function (x) { return x.g > 0; });
      return {
        id: 'r-' + sp.phase + (sp.index ? '-' + sp.index : ''), tipo: st.tipo, durata: { min: sp.min, target: sp.target, max: sp.max },
        sensibileTemperatura: !!st.sens, foto: st.foto, nome: st.nome, istruzioni: st.istruzioni, segnale: st.segnale,
        stimato: !!sp.est, grammi: g.map(function (x) { return { name: x.name, type: x.type, g: x.g }; })
      };
    });
    return { steps: feedSteps.concat(steps), ingredients: ing, feeds: fed, starterG: starterG, scale: loaf / total, loafG: loaf };
  }

  return { PRESETS: PRESETS, METHODS: METHODS, buildRecipe: buildRecipe, fromImported: fromImported };
});
