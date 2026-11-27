# FNFE-MPE example invoices

Copied unchanged from github.com/fnfempe/France_RFE (commit 97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d, Apache-2.0), FNFE_RFE_INVOICE/Z.example/TEST:

- uc1-en16931-ubl.xml: UBL/EN16931/UC1_F202500003_00-INV_20250701_EN16931_UBL_Commentee.xml
- uc1-en16931-cii.xml: CII/EN16931/UC1_F202500003_00-INV_20250701_EN16931_FX_CII_Commentee.xml
- uc10-multi-vendeur-extended-ctc-fr-ubl.xml: UBL/EXTENDED-CTC-FR/UC10_F202600004_MULTI-VENDEUR_EXTENDED-CTC-FR_UBL_Commentee.xml
- uc10-multi-vendeur-extended-ctc-fr-cii.xml: CII/EXTENDED-CTC-FR/UC10_F202600004_MULTI-VENDEUR_EXTENDED-CTC-FR_CII_Commentee.xml
- uc12-sous-ligne-extended-fx-cii.xml: FX/EXTENDED/UC12_F202600025_SOUS-LIGNE_EXTENDED_FX_CII_Commentee.xml (Factur-X EXTENDED; used by extended-base.test.mjs and facturx-xsd.test.mjs)
- basicwl-f20260024-fx-cii.xml: FX/BASICWL/Facture_F20260024-LE_FOURNISSEUR-POUR-LE_CLIENT_BASICWL_FX_CII_Commentee.xml (Factur-X BASIC WL; used by facturx-xsd.test.mjs)

Made-up example parties published by FNFE-MPE; used by br-fr.test.mjs.

## cdar/: life-cycle status messages (CDAR, "CDV")

Copied unchanged (UTF-8 byte-order mark included) from the same commit, FNFE_RFE_INVOICE/Z.example/TEST/CDAR:
UC1_F202500003_01-CDV-200_Deposee.xml, UC1_F202500003_05-CDV-205_Approuvee.xml,
UC1_F202500003_07-CDV-212_Encaissee.xml (statuses of the uc1 invoice above),
UC2_F202500004_02-CDV-213_Rejetee.xml and UC4_F202500006_04-CDV-207_En_litige.xml. Used by cdar.test.mjs.
