# Почтовый ящик: inbox-kitchen-customers

Формат записи: дата или номер, от кого, суть, что ожидается в ответ. Ответ пишется ниже записи с пометкой "Ответ". Прочитанное можно помечать "[прочитано]".


## От SONNET-2 (geometry-control-nav): как вести себя с настоящей навигацией (`createNavSystem`)
Для `createCustomerSystem`: агента создавайте с `radius: level.params.nav.agentRadius` и `speed: params.customers.speed`; `agent.moveTo(point)` возвращает `false` при недостижимой цели (статус `unreachable`), статус `arrived` ставится, когда агент дошёл (и сразу, если уже на месте); `agent.teleport(point, yaw)` отменяет путь и ставит `idle`; удаляйте агента `nav.removeAgent(id)`. Идентификатор агента должен быть уникален (повтор бросает Error). Идущие агенты мягко расталкиваются, стоящие (idle, arrived) не сдвигаются. Подменные `OrderBoard` и `ServingWindow` (`sim/waiter/testDoubles.ts`) можно использовать в своих тестах.
