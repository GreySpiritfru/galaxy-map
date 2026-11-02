"""Последовательные проверки. Каждый запуск начинается с Browser.prepare()."""

SCENARIOS = ('layers-esc', 'layers-history', 'search-return', 'menu-section', 'menu-over-map',
             'view-roundtrip', 'keyboard-panel', 'text-200')
ARTICLE = 'tt/greyspirit/4tRzyNaVfEQ'


def run_scenario(b, name, step):
    def tap(selector):
        b.click(selector)
        b.settle()

    def expect(**values):
        b.expect(**values)

    if name.startswith('layers-'):
        step('Прокрутить планшет', lambda: b.probe('scrollSave', 'tablet'))
        step('Открыть статью с картинками', lambda: b.probe('record', ARTICLE))
        step('Дождаться окна', lambda: b.wait_state(window=True))
        step('Открыть картинку касанием', lambda: tap(b.probe('image')))
        step('Дождаться PhotoSwipe', lambda: b.wait_state(viewer=True))
        back = b.escape if name == 'layers-esc' else b.back
        step('Первый назад', back)
        step('Закрылась только картинка', lambda: expect(viewer=False, window=True, tablet=True))
        step('Второй назад', back)
        step('Окно закрылось, планшет остался', lambda: expect(viewer=False, window=False, tablet=True))
        step('Прокрутка планшета сохранена', lambda: b.probe('scrollCheck', 'tablet'))
    elif name == 'search-return':
        step('Открыть поиск', lambda: tap('#planshetSearch'))
        step('Дождаться поля', lambda: b.wait_state(search=True, ready=True))
        step('Ввести «феном»', lambda: b.type_text('феном'))
        step('Дождаться результатов', lambda: b.wait_state(results=True))
        # Save after bringing the first result into view, so tapping cannot change the baseline.
        target = step('Выбрать первый результат', lambda: b.probe('firstResult'))
        step('Сохранить запрос и позицию', lambda: b.probe('saveSearch'))
        step('Открыть первую запись', lambda: tap(target))
        step('Дождаться окна записи', lambda: b.wait_state(window=True))
        step('Esc из записи', b.escape)
        step('Поиск с прежним запросом', lambda: expect(window=False, search=True, query='феном'))
        step('Позиция поиска сохранена', lambda: b.probe('scrollCheck', 'search'))
        step('Очистить запрос', lambda: tap('.p-search-clear'))
        step('Поле пустое', lambda: expect(search=True, query=''))
        step('Запись в «Недавно открытые»', lambda: b.probe('recent'))
        step('Закрыть поиск кнопкой панели', lambda: tap('#planshetSearch'))
        step('Поиск закрыт', lambda: expect(search=False, tablet=True))
    elif name == 'menu-section':
        step('Открыть шторку', lambda: tap('#planshetBrand'))
        step('Шторка открыта', lambda: b.wait_state(menu=True))
        step('Включить граф связей', lambda: tap('#menuGraph'))
        step('Граф виден, планшет скрыт', lambda: b.wait_state(graph=True, tabletHidden=True, menu=False))
        step('Повторно открыть шторку', lambda: tap('#planshetBrand'))
        step('Шторка над графом', lambda: b.wait_state(menu=True, overMap=True, graph=True))
        step('Выключить граф связей', lambda: tap('#menuGraph'))
        step('Снова планшет', lambda: b.wait_state(graph=False, tablet=True, menu=False))
        target = step('Выбрать плитку на главной', lambda: b.probe('sectionTarget'))
        step('Открыть раздел', lambda: tap(target))
        step('Показан выбранный раздел', lambda: b.probe('sectionCheck'))
        step('Вернуться через «‹ Всё»', lambda: tap('#planshet .sec-back'))
        step('Главная открыта', lambda: b.probe('home'))
        step('Открыть шторку перед Esc', lambda: tap('#planshetBrand'))
        step('Шторка открыта перед Esc', lambda: expect(menu=True))
        step('Esc из шторки', b.escape)
        step('Шторка закрыта', lambda: expect(menu=False, tablet=True))
    elif name == 'menu-over-map':
        step('Открыть карту', lambda: tap('[data-view="map"]'))
        step('Карта видна', lambda: b.wait_state(map=True, mapVisible=True, tabletHidden=True))
        step('Открыть шторку над картой', lambda: tap('#planshetBrand'))
        step('Карта под шторкой видна', lambda: b.wait_state(menu=True, overMap=True, map=True, mapVisible=True))
        step('Коснуться подложки мимо шторки', lambda: tap('#planshet'))
        step('Шторка и подложка закрыты', lambda: b.wait_state(menu=False, tabletHidden=True, mapVisible=True))
        step('Открыть поиск с карты', lambda: tap('#planshetSearch'))
        step('Дождаться поля', lambda: b.wait_state(search=True, ready=True))
        step('Ввести «феном»', lambda: b.type_text('феном'))
        step('Дождаться результатов', lambda: b.wait_state(results=True))
        target = step('Выбрать первую запись', lambda: b.probe('firstResult'))
        step('Открыть запись', lambda: tap(target))
        step('Окно записи открыто', lambda: b.wait_state(window=True))
        step('Esc из записи', b.escape)
        step('Вернулись результаты', lambda: b.wait_state(window=False, search=True, results=True, query='феном'))
        step('Закрыть поиск кнопкой панели', lambda: tap('#planshetSearch'))
        step('Снова карта', lambda: b.wait_state(search=False, tabletHidden=True, map=True, mapVisible=True))
        step('Открыть шторку для схемы', lambda: tap('#planshetBrand'))
        step('Шторка открыта', lambda: b.wait_state(menu=True, overMap=True))
        step('Открыть схему корабля', lambda: tap('#planshetMenu .p-menu-ship'))
        step('Феном открыт на схеме', lambda: b.wait_state(ship=True, menu=False))
    elif name == 'view-roundtrip':
        step('Из планшета на карту', lambda: tap('[data-view="map"]'))
        step('Карта открыта', lambda: b.wait_state(map=True, tabletHidden=True))
        step('Открыть «Графику»', lambda: tap('[data-view="graphics"]'))
        step('Графика открыта', lambda: b.wait_state(graphics=True))
        step('Из графики в Ноды', lambda: tap('[data-view="nodes"]'))
        step('Планшет открыт', lambda: b.wait_state(tablet=True))
        step('Открыть шторку', lambda: tap('#planshetBrand'))
        step('Шторка открыта', lambda: b.wait_state(menu=True))
        step('Показать граф', lambda: tap('#menuGraph'))
        step('Граф открыт', lambda: b.wait_state(graph=True, tabletHidden=True, menu=False))
        step('Открыть шторку над графом', lambda: tap('#planshetBrand'))
        step('Шторка над графом открыта', lambda: b.wait_state(menu=True, overMap=True))
        step('Вернуться к планшету', lambda: tap('#menuGraph'))
        step('Планшет снова открыт', lambda: b.wait_state(tablet=True))
        step('Выбрать «Графику» из Нод', lambda: tap('[data-view="graphics"]'))
        step('Открылась именно Графика', lambda: b.wait_state(graphics=True, tabletHidden=True, graph=False))
        step('Выбрать «Карту»', lambda: tap('[data-view="map"]'))
        step('Открылась именно Карта', lambda: b.wait_state(map=True, graphics=False, graph=False))
    elif name == 'keyboard-panel':
        step('Включить клавиатурный режим', lambda: b.key('Tab', 9))
        step('Начать фокус с панели', lambda: b.probe('focusStart'))
        first = step('Проверить фокус первой кнопки', lambda: b.probe('focus'))
        seen = {first['view'] or first['id']}
        for i in range(16):
            step(f'Tab {i + 1}', lambda: b.key('Tab', 9))
            focus = step(f'Проверить фокус {i + 1}', lambda: b.probe('focus'))
            if not focus['panel']:
                break
            seen.add(focus['view'] or focus['id'])
            if focus['id'] == 'planshetBrand':
                break
        def coverage():
            missing = {'planshetBrand', 'planshetSearch', 'nodes', 'map', 'graphics'} - seen
            if missing:
                raise RuntimeError('Tab не обошёл панель: ' + ', '.join(sorted(missing)))
        step('Обойдены видимые кнопки панели', coverage)
        step('Оставить фокус на панели для снимка', lambda: b.probe('focusStart'))
        step('Кольцо фокуса перед снимком', lambda: b.probe('focus'))
    elif name == 'text-200':
        step('Увеличить корневой шрифт до 200%', lambda: b.probe('enlarge'))
        step('Дождаться раскладки', b.settle)
        step('Панель целиком в экране', lambda: b.probe('overflow'))
    else:
        raise ValueError(name)
