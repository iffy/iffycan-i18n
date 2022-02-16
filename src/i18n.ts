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
export interface NumberFormat {
  thousands: string;
  decimal: string;
  decimal_places: number;
}

export interface LangPackFetcher {
  (locale:string):Promise<ILangPack>
}

export class TranslationContext {
  private _langpack!:ILangPack;
  private _locale!:string;
  private fetcher!:LangPackFetcher;
  private default_locale!:string;

  public number_format:NumberFormat = {
    thousands: ',',
    decimal: '.',
    decimal_places: 2,
  };

  readonly localechanged = new EventSource<{locale:string}>();

  configure(args:{
    default_locale: string;
    fetcher: LangPackFetcher;
  }) {
    this.default_locale = args.default_locale.substr(0, 2);
    this.fetcher = args.fetcher;
  }

  get locale() {
    return this._locale
  }
  get langpack() {
    return this._langpack;
  }
  private async loadLangPack(locale:string) {
    return this.fetcher(locale);
  }
  async setLocale(x:string) {
    
    // only 2-letter shortcodes are supported right now
    let totry:string[] = [
      x.substr(0, 2),
      this.default_locale,
    ]
    for (const locale of totry) {
      try {
        // language
        this._langpack = await this.loadLangPack(locale);
        this._locale = locale;
        config.logger.info(`locale set to: ${locale}`);

        // // date
        // try {
        //   moment.locale(this._locale)
        //   config.logger.info('date format set');
        // } catch(err) {
        //   if (locale !== this.default_locale) {
        //     config.logger.error('Error setting date locale', err.stack);  
        //   }
        // }

        // numbers
        try {
          Object.assign(this.number_format, this.getNumberFormat());
          config.logger.info('number format set:', JSON.stringify(this.number_format));
        } catch(err) {
          config.logger.error('Error setting number format', err.stack);
        }

        this.localechanged.emit({locale: this._locale});
        break;
      } catch(err) {
        config.logger.error(`Error setting locale to ${locale}: ${err}`)
      }  
    }
  }
  getNumberFormat():NumberFormat {
    return this.langpack.numbers;
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
// Used to be from https://derickbailey.com/2016/03/09/creating-a-true-singleton-in-node-js-with-es6-symbols/
//---------------------------------------------------------
const I18N_SINGLETON_KEY = "@iffycan.i18n.tx.singleton";
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

