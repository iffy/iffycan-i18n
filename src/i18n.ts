import * as moment from 'moment-timezone'
import { EventSource } from '@iffycan/events'

export let config = {
  logger: console,
}

//-----------------------------------------------------------------
// Message structure
//-----------------------------------------------------------------
/**
 *  An individual message in a IMessageSet
 */
export interface IMsg<T> {
  val: T;
  translated: boolean;
  h: string;
  newval?: T;
}
/**
 *  An applications set of messages
 */
export interface IMessageSet {
  [k:string]: IMsg<any>;
}
/**
 *  A locale for the application
 */
export interface ILangPack {
  name: string;
  dir: 'ltr'|'rtl';
  numbers: NumberFormat;
  messages: IMessageSet;
  contributors: Array<{
    name: string;
    href?: string;
  }>;
}

//-----------------------------------------------------------------
// Numbers
//-----------------------------------------------------------------
export interface ISeps {
  group: string;
  group_regex: RegExp;
  decimal: string;
  decimal_regex: RegExp;
}
export type NumberFormat =
  | ''
  | 'comma-period'
  | 'period-comma'
  | 'space-comma'

export type NumberFormatDef = {
  [K in NumberFormat]: INumberFormat
}
export type NumberFormatExample = {
  [K in NumberFormat]: string;
}
export interface INumberFormat {
  group: string;
  group_regex: RegExp;
  decimal: string;
  decimal_regex: RegExp;
}
export const NUMBER_FORMAT_EXAMPLES:NumberFormatExample = {
  '': '',
  'comma-period': '1,400.82',
  'period-comma': '1.400,82',
  'space-comma': '1 400,82',
}
export const NUMBER_FORMATS:NumberFormatDef = {
  '': {
    group: ',',
    group_regex: /,/g,
    decimal: '.',
    decimal_regex: /\./g,
  },
  'comma-period': {
    group: ',',
    group_regex: /,/g,
    decimal: '.',
    decimal_regex: /\./g,
  },
  'period-comma': {
    group: '.',
    group_regex: /\./g,
    decimal: ',',
    decimal_regex: /,/g,
  },
  'space-comma': {
    group: ' ',
    group_regex: /[ ]/g,
    decimal: ',',
    decimal_regex: /,/g,
  }
}

export class TranslationContext {
  private _langpack!:ILangPack;
  private _locale!:string;
  private langpack_basepath!:string;

  public number_seps:ISeps = NUMBER_FORMATS[''];

  readonly localechanged = new EventSource<{locale:string}>();

  configure(args:{
    langpack_basepath: string,
  }) {
    this.langpack_basepath = args.langpack_basepath;
  }

  get locale() {
    return this._locale
  }
  get langpack() {
    return this._langpack;
  }
  private async loadLangPack(locale:string) {
    const mod = await import(`${this.langpack_basepath}/${locale}`);
    return mod.pack as ILangPack;
  }
  async setLocale(x:string) {
    
    // only 2-letter shortcodes are supported right now
    let totry:string[] = [
      x.substr(0, 2),
    ]
    for (const locale of totry) {
      try {
        // language
        this._langpack = await this.loadLangPack(locale);
        this._locale = locale;
        config.logger.info(`locale set to: ${locale}`);

        // date
        try {
          await import(`moment/locale/${locale}`);
          moment.locale(this._locale)
          config.logger.info('date format set');
        } catch(err) {
          if (locale !== 'en') {
            config.logger.error('Error setting date locale', err.stack);  
          }
        }

        // numbers
        try {
          Object.assign(this.number_seps, this.getNumberFormat());
          config.logger.info('number format set:', JSON.stringify(this.number_seps));
        } catch(err) {
          config.logger.error('Error setting number format', err.stack);
        }

        this.localechanged.emit({locale: this._locale});
        break;
      } catch(err) {
        config.logger.error(`Error setting locale to ${locale}`)
        config.logger.error(err.stack);
      }  
    }
  }
  getNumberFormat():INumberFormat {
    return NUMBER_FORMATS[this.langpack.numbers]
  }
  sss<T>(key:keyof IMessageSet, dft?:T):T {
    if (!this._langpack) {
      throw new Error(`Attmpting to use sss() before setting the locale: ${key}`)
    }
    let entry = this._langpack.messages[key];
    if (dft === undefined && typeof key === 'string') {
      // The key is the string to translate.
      return (entry ? entry.val : key) as any;
    } else {
      return (entry ? entry.val : dft) as any;
    }
  }
  toString() {
    return `TranslationContext locale=${this._locale}`;
  }
  /**
   *  Call this to start localization for renderer HTML/JS pages
   */
  async localizeThisHTMLPage(locale:string, args?:{
      skipwatch?:boolean,
    }) {
    args = args || {};
    if (!this._locale) {
      await this.setLocale(locale);
    }
    document.documentElement.setAttribute('dir', this.langpack.dir);
    Array.from(document.querySelectorAll<HTMLElement>('[data-translate]'))
    .forEach((elem:HTMLElement) => {
      try {
        let trans_id = elem.getAttribute('data-translate');
        let dft = elem.innerText;
        if (!trans_id) {
          trans_id = dft;
        }
        elem.innerHTML = this.sss(trans_id as any, dft);
      } catch(err) {
        config.logger.warn('Localization error:', err, elem);
      }
    })
    if (!args.skipwatch) {
      this.localechanged.on(() => {
        config.logger.info('Re-localizing page', this.locale);
        this.localizeThisHTMLPage(this.locale, {skipwatch:true});
      })
    }
  }
}


//---------------------------------------------------------
// Singleton Context
//
// From https://derickbailey.com/2016/03/09/creating-a-true-singleton-in-node-js-with-es6-symbols/
//---------------------------------------------------------
const I18N_SINGLETON_KEY = Symbol.for("@iffycan.i18n");
let singleton:TranslationContext;

if ((global as any)[I18N_SINGLETON_KEY] === undefined) {
  // First time
  singleton = (global as any)[I18N_SINGLETON_KEY] = new TranslationContext();
} else {
  // Subsequent times
  singleton = (global as any)[I18N_SINGLETON_KEY]
}

export const CONTEXT = singleton;
export const sss = singleton.sss.bind(singleton);
export const configure = singleton.configure.bind(singleton);

