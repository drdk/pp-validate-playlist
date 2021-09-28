var event_type = {
	unknown:	0x0000,  
	live:       0x0001,  // LIVE
	program:    0x0002,  // PROGRAM
	junction:   0x0004,  // LINEUP, TRAILER, PROMO, IDENT
	mask_all:   0x0001 | 0x0002 | 0x0004
}

module.exports.event_type = event_type;

