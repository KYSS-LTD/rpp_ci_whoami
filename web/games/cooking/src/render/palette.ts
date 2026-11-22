// Цвета сцены: подобраны по атласу KayKit Restaurant Bits (бирюзовые стены, оранжевые столешницы, коричневое дерево),
// чтобы примитивы персонажей, пол зала и улица не выбивались из пака.

// Цвета пола по зонам (кухня рисуется плиткой из модели пака, здесь запасной цвет под плитку).
export const floorColors = {
	kitchen: 0xdfe4e8,
	hall: 0xc89f72,
	street: 0x78965c,
	garden: 0x79a94f,
} as const;

// Цвет фона сцены (за краем улицы).
export const backgroundColor = 0x1f2a30;

// Небо и туман утром и вечером (туман прячет край травяного поля), цвет неба для полусферического света.
export const skyColors = {
	morning: 0xb7d6dc,
	evening: 0xf2ab7e,
	hemisphereMorning: 0xdfeaff,
	hemisphereEvening: 0xffc49a,
} as const;

// Цвет солнца утром и вечером.
export const sunColors = { morning: 0xfff3df, evening: 0xffa95e } as const;

// Цвет общего света утром и вечером.
export const ambientColors = { morning: 0xffffff, evening: 0xffd9bc } as const;

// Цвет подсветки цели взаимодействия и подсветки отказа.
export const targetHighlightColor = 0xffd23f;
export const rejectHighlightColor = 0xff4d3d;

// Цвета индикаторов над станциями: подложка, зелёная полоса готовки, красная полоса подгорания.
export const barBackgroundColor = 0x1b2025;
export const barProgressColor = 0x4cd964;
export const barBurnColor = 0xff3b30;
// Цвет красной полосы подгорания в момент мигания, когда блюдо скоро сгорит.
export const barBurnWarningColor = 0xffa21a;

// Тёмный цвет для сгоревших предметов без своей модели в паке.
export const burntTintColor = 0x2b2523;

// Цвета урны (в паке модели нет).
export const trashColors = { body: 0x59626a, rim: 0x2f353a, lid: 0x3d444b } as const;

// Оттенки кожи персонажей (по номеру варианта).
export const skinTones = [0xf1c9a5, 0xe0a97c, 0xc78a5d, 0x8d5a3b] as const;

// Цвета волос клиентов.
export const hairColors = [0x2b2118, 0x6b4423, 0xb5651d, 0xe3b04b, 0x9a9a9a, 0xb23a48] as const;

// Цвета одежды клиентов (по CustomerSnapshot.variant): различимы между собой, не совпадают с белым поваром и чёрным официантом.
export const customerShirtColors = [0x4a7fc1, 0xe8552b, 0x1fa88a, 0xf2b84a, 0x8fbf3a, 0xe86a7a, 0x7a5b8c, 0xb0653c] as const;

// Цвета повара и официанта.
export const chefColors = { coat: 0xf6f8fa, trousers: 0x3b4a5a, hat: 0xffffff, scarf: 0xe8552b, shoes: 0x2b3138, apron: 0x2f4a6d } as const;
export const waiterColors = { vest: 0x2b3138, shirt: 0xf6f8fa, trousers: 0x23282e, bowtie: 0xd8262c, hair: 0x2b2118, shoes: 0x14171a, apron: 0x1f2328 } as const;

// Цвет тени-пятна под персонажем.
export const shadowColor = 0x000000;
