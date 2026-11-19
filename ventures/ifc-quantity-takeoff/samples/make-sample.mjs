// Writes samples/sample-office.ifc: a small hand-made IFC4 model whose every
// volume is worked out by hand (sample.test.mjs checks them), with the faults
// real exports carry planted in it. Run: node samples/make-sample.mjs
//
//   Wall A   5000 x 200 x 3000 mm, a 1000 x 2100 door opening through it:
//            gross 3.0 m3, net 3.0 - 1.0 x 0.2 x 2.1 = 2.58 m3 (stored, right)
//   Wall B   4000 x 200, top cut by a plane from 3000 mm high at one end to
//            2000 mm at the other: 0.2 x 4 x 2.5 = 2.0 m3 (stored, right)
//   Wall C   3000 x 200 x 3000 on each of two levels, one wall split by level:
//            each piece stores the whole wall's 3.6 m3 and 18 m2 side area
//            (the split-by-level fault); each piece's side is 3 x 3 = 9 m2
//   Slab     5000 x 4000 x 250: 5.0 m3 (stored, right)
//   Column   round, radius 150, 3000 high: pi x 0.15^2 x 3 = 0.212058 m3 (none stored)
//   Beam     IPE 200 (100 x 200, web 5.6, flange 8.5, root radius 12), 4000 long:
//            section 2 x 100 x 8.5 + 183 x 5.6 + (4 - pi) x 12^2 = 2848.45 mm2
//            (the steel tables give 28.48 cm2), 0.0113938 m3; it stores
//            0.0142 m3, a wrong value the check should flag as unexplained

import { writeFileSync } from "node:fs";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
let seed = 7;
const guid = () => { let s = "1"; for (let i = 0; i < 21; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; s += CHARS[(seed >>> 16) % 64]; } return `'${s}'`; };

const L = [];
const e = (id, body) => L.push(`#${id}=${body.replace(/\bG\b/g, () => guid())};`);

e(1, "IFCPROJECT(G,$,'Sample office',$,$,$,$,(#20),#10)");
e(10, "IFCUNITASSIGNMENT((#11,#12,#13,#14))");
e(11, "IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)");
e(12, "IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
e(13, "IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
e(14, "IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
e(20, "IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$)");
e(21, "IFCAXIS2PLACEMENT3D(#22,$,$)");
e(22, "IFCCARTESIANPOINT((0.,0.,0.))");
e(23, "IFCDIRECTION((0.,0.,1.))");
e(24, "IFCDIRECTION((1.,0.,0.))");
e(25, "IFCDIRECTION((0.,1.,0.))");
e(30, "IFCSITE(G,$,'Site',$,$,#31,$,$,.ELEMENT.,$,$,$,$,$)");
e(31, "IFCLOCALPLACEMENT($,#21)");
e(40, "IFCBUILDING(G,$,'Building',$,$,#41,$,$,.ELEMENT.,$,$,$)");
e(41, "IFCLOCALPLACEMENT(#31,#21)");
e(50, "IFCBUILDINGSTOREY(G,$,'Level 1',$,$,#51,$,$,.ELEMENT.,0.)");
e(51, "IFCLOCALPLACEMENT(#41,#21)");
e(52, "IFCBUILDINGSTOREY(G,$,'Level 2',$,$,#53,$,$,.ELEMENT.,3000.)");
e(53, "IFCLOCALPLACEMENT(#41,#54)");
e(54, "IFCAXIS2PLACEMENT3D(#55,$,$)");
e(55, "IFCCARTESIANPOINT((0.,0.,3000.))");
e(60, "IFCRELAGGREGATES(G,$,$,$,#1,(#30))");
e(61, "IFCRELAGGREGATES(G,$,$,$,#30,(#40))");
e(62, "IFCRELAGGREGATES(G,$,$,$,#40,(#50,#52))");
e(70, "IFCMATERIAL('Concrete C30/37',$,$)");
e(71, "IFCMATERIAL('Steel S355',$,$)");
e(72, "IFCRELASSOCIATESMATERIAL(G,$,$,$,(#100,#200,#300,#320,#400,#500),#70)");
e(73, "IFCRELASSOCIATESMATERIAL(G,$,$,$,(#600),#71)");
e(80, "IFCWALLTYPE(G,$,'Basic Wall 200',$,$,$,$,$,$,.STANDARD.)");
e(81, "IFCRELDEFINESBYTYPE(G,$,$,$,(#100,#200,#300,#320),#80)");
e(82, "IFCCLASSIFICATIONREFERENCE($,'B2010','Exterior Walls',$,$,$)");
e(83, "IFCRELASSOCIATESCLASSIFICATION(G,$,$,$,(#100,#200,#300,#320),#82)");

// Wall A with a door opening
e(100, "IFCWALL(G,$,'Wall A',$,$,#101,#102,'2001',.STANDARD.)");
e(101, "IFCLOCALPLACEMENT(#51,#21)");
e(102, "IFCPRODUCTDEFINITIONSHAPE($,$,(#103))");
e(103, "IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#104))");
e(104, "IFCEXTRUDEDAREASOLID(#105,#21,#23,3000.)");
e(105, "IFCRECTANGLEPROFILEDEF(.AREA.,$,#106,5000.,200.)");
e(106, "IFCAXIS2PLACEMENT2D(#107,$)");
e(107, "IFCCARTESIANPOINT((2500.,0.))");
e(110, "IFCOPENINGELEMENT(G,$,'Door opening',$,$,#111,#112,$,.OPENING.)");
e(111, "IFCLOCALPLACEMENT(#101,#113)");
e(113, "IFCAXIS2PLACEMENT3D(#114,$,$)");
e(114, "IFCCARTESIANPOINT((1000.,0.,0.))");
e(112, "IFCPRODUCTDEFINITIONSHAPE($,$,(#115))");
e(115, "IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#116))");
e(116, "IFCEXTRUDEDAREASOLID(#117,#21,#23,2100.)");
e(117, "IFCRECTANGLEPROFILEDEF(.AREA.,$,#118,1000.,400.)");
e(118, "IFCAXIS2PLACEMENT2D(#119,$)");
e(119, "IFCCARTESIANPOINT((500.,0.))");
e(120, "IFCRELVOIDSELEMENT(G,$,$,$,#100,#110)");
e(130, "IFCELEMENTQUANTITY(G,$,'Qto_WallBaseQuantities',$,$,(#131,#132,#133,#134,#135,#136))");
e(131, "IFCQUANTITYLENGTH('Length',$,$,5000.,$)");
e(132, "IFCQUANTITYLENGTH('Height',$,$,3000.,$)");
e(133, "IFCQUANTITYLENGTH('Width',$,$,200.,$)");
e(134, "IFCQUANTITYVOLUME('GrossVolume',$,$,3.,$)");
e(135, "IFCQUANTITYVOLUME('NetVolume',$,$,2.58,$)");
e(136, "IFCQUANTITYAREA('NetSideArea',$,$,12.9,$)");
e(137, "IFCRELDEFINESBYPROPERTIES(G,$,$,$,(#100),#130)");

// Wall B, top clipped by a sloped plane
e(200, "IFCWALL(G,$,'Wall B',$,$,#201,#202,'2002',.STANDARD.)");
e(201, "IFCLOCALPLACEMENT(#51,#203)");
e(203, "IFCAXIS2PLACEMENT3D(#204,$,$)");
e(204, "IFCCARTESIANPOINT((0.,4000.,0.))");
e(202, "IFCPRODUCTDEFINITIONSHAPE($,$,(#205))");
e(205, "IFCSHAPEREPRESENTATION(#20,'Body','Clipping',(#206))");
e(206, "IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#207,#210)");
e(207, "IFCEXTRUDEDAREASOLID(#208,#21,#23,3000.)");
e(208, "IFCRECTANGLEPROFILEDEF(.AREA.,$,#209,4000.,200.)");
e(209, "IFCAXIS2PLACEMENT2D(#211,$)");
e(211, "IFCCARTESIANPOINT((2000.,0.))");
e(210, "IFCHALFSPACESOLID(#212,.F.)");
e(212, "IFCPLANE(#213)");
e(213, "IFCAXIS2PLACEMENT3D(#214,#215,$)");
e(214, "IFCCARTESIANPOINT((0.,0.,3000.))");
e(215, "IFCDIRECTION((0.242535625036333,0.,0.970142500145332))");
e(230, "IFCELEMENTQUANTITY(G,$,'Qto_WallBaseQuantities',$,$,(#231,#232,#233))");
e(231, "IFCQUANTITYLENGTH('Length',$,$,4000.,$)");
e(232, "IFCQUANTITYLENGTH('Width',$,$,200.,$)");
e(233, "IFCQUANTITYVOLUME('GrossVolume',$,$,2.,$)");
e(234, "IFCRELDEFINESBYPROPERTIES(G,$,$,$,(#200),#230)");

// Wall C, split by level, both pieces carrying the whole wall's volume
for (const [id, storeyPl] of [[300, 51], [320, 53]]) {
  e(id, "IFCWALL(G,$,'Wall C',$,$,#" + (id + 1) + ",#" + (id + 2) + ",'1001',.STANDARD.)");
  e(id + 1, `IFCLOCALPLACEMENT(#${storeyPl},#${id + 3})`);
  e(id + 3, `IFCAXIS2PLACEMENT3D(#${id + 4},$,$)`);
  e(id + 4, "IFCCARTESIANPOINT((6000.,0.,0.))");
  e(id + 2, `IFCPRODUCTDEFINITIONSHAPE($,$,(#${id + 5}))`);
  e(id + 5, `IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#${id + 6}))`);
  e(id + 6, `IFCEXTRUDEDAREASOLID(#${id + 7},#21,#23,3000.)`);
  e(id + 7, `IFCRECTANGLEPROFILEDEF(.AREA.,$,#${id + 8},3000.,200.)`);
  e(id + 8, `IFCAXIS2PLACEMENT2D(#${id + 9},$)`);
  e(id + 9, "IFCCARTESIANPOINT((1500.,0.))");
  e(id + 10, `IFCELEMENTQUANTITY(G,$,'Qto_WallBaseQuantities',$,$,(#${id + 11},#${id + 12},#${id + 13},#${id + 14},#${id + 16}))`);
  e(id + 11, "IFCQUANTITYLENGTH('Length',$,$,3000.,$)");
  e(id + 12, "IFCQUANTITYLENGTH('Height',$,$,6000.,$)");
  e(id + 13, "IFCQUANTITYLENGTH('Width',$,$,200.,$)");
  e(id + 14, "IFCQUANTITYVOLUME('GrossVolume',$,$,3.6,$)");
  e(id + 15, `IFCRELDEFINESBYPROPERTIES(G,$,$,$,(#${id}),#${id + 10})`);
  // and the whole wall's side area, 3 x 6 = 18 m2, on each 9 m2 piece
  e(id + 16, "IFCQUANTITYAREA('GrossSideArea',$,$,18.,$)");
}

// Slab
e(400, "IFCSLAB(G,$,'Floor slab',$,$,#401,#402,'3001',.FLOOR.)");
e(401, "IFCLOCALPLACEMENT(#51,#403)");
e(403, "IFCAXIS2PLACEMENT3D(#404,$,$)");
e(404, "IFCCARTESIANPOINT((0.,0.,-250.))");
e(402, "IFCPRODUCTDEFINITIONSHAPE($,$,(#405))");
e(405, "IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#406))");
e(406, "IFCEXTRUDEDAREASOLID(#407,#21,#23,250.)");
e(407, "IFCRECTANGLEPROFILEDEF(.AREA.,$,#408,5000.,4000.)");
e(408, "IFCAXIS2PLACEMENT2D(#409,$)");
e(409, "IFCCARTESIANPOINT((2500.,2000.))");
e(410, "IFCELEMENTQUANTITY(G,$,'Qto_SlabBaseQuantities',$,$,(#411,#412))");
e(411, "IFCQUANTITYAREA('GrossArea',$,$,20.,$)");
e(412, "IFCQUANTITYVOLUME('NetVolume',$,$,5.,$)");
e(413, "IFCRELDEFINESBYPROPERTIES(G,$,$,$,(#400),#410)");

// Round column, no stored quantities
e(500, "IFCCOLUMN(G,$,'Column 300',$,$,#501,#502,'4001',.COLUMN.)");
e(501, "IFCLOCALPLACEMENT(#51,#503)");
e(503, "IFCAXIS2PLACEMENT3D(#504,$,$)");
e(504, "IFCCARTESIANPOINT((5000.,4000.,0.))");
e(502, "IFCPRODUCTDEFINITIONSHAPE($,$,(#505))");
e(505, "IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#506))");
e(506, "IFCEXTRUDEDAREASOLID(#507,#21,#23,3000.)");
e(507, "IFCCIRCLEPROFILEDEF(.AREA.,$,#508,150.)");
e(508, "IFCAXIS2PLACEMENT2D(#22,$)");

// IPE 200 beam with a wrong stored volume
e(600, "IFCBEAM(G,$,'Beam IPE 200',$,$,#601,#602,'5001',.BEAM.)");
e(601, "IFCLOCALPLACEMENT(#51,#603)");
e(603, "IFCAXIS2PLACEMENT3D(#604,$,$)");
e(604, "IFCCARTESIANPOINT((0.,2000.,2900.))");
e(602, "IFCPRODUCTDEFINITIONSHAPE($,$,(#605))");
e(605, "IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#606))");
e(606, "IFCEXTRUDEDAREASOLID(#607,#608,#23,4000.)");
e(607, "IFCISHAPEPROFILEDEF(.AREA.,'IPE200',#609,100.,200.,5.6,8.5,12.,$,$)");
e(608, "IFCAXIS2PLACEMENT3D(#22,#24,#25)");
e(609, "IFCAXIS2PLACEMENT2D(#22,$)");
e(610, "IFCELEMENTQUANTITY(G,$,'Qto_BeamBaseQuantities',$,$,(#611,#612,#613))");
e(611, "IFCQUANTITYLENGTH('Length',$,$,4000.,$)");
e(612, "IFCQUANTITYAREA('CrossSectionArea',$,$,0.0028484,$)");
e(613, "IFCQUANTITYVOLUME('NetVolume',$,$,0.0142,$)");
e(614, "IFCRELDEFINESBYPROPERTIES(G,$,$,$,(#600),#610)");

e(900, "IFCRELCONTAINEDINSPATIALSTRUCTURE(G,$,$,$,(#100,#200,#300,#400,#500,#600),#50)");
e(901, "IFCRELCONTAINEDINSPATIALSTRUCTURE(G,$,$,$,(#320),#52)");

const head = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1');
FILE_NAME('sample-office.ifc','2026-11-19T00:00:00',(''),(''),'ifc-quantity-takeoff samples/make-sample.mjs','hand-written','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
`;
writeFileSync(new URL("./sample-office.ifc", import.meta.url), head + L.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n");
