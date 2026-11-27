# Conditions d'utilisation

**Version 2026-11-27** · Maris Stella Labs LLC

**Traduction non contractuelle.** Cette version française n'est fournie que pour faciliter la lecture. Seule la version anglaise des Terms of Service, à l'adresse /app/terms, fait foi ; en cas de divergence, la version anglaise prévaut.

## 1. Qui nous sommes

L'espace e-facture et l'API (le « Service ») sont exploités par **Maris Stella Labs LLC**, une limited liability company de l'État du Colorado (« nous »). Les présentes conditions constituent un accord entre nous et le cabinet ou l'entreprise qui crée un compte (le « Client », « vous »). La personne qui accepte ces conditions confirme qu'elle est habilitée à le faire au nom du cabinet ou de l'entreprise.

## 2. Le Service

Le Service contrôle des factures électroniques (XML UBL et UN/CEFACT CII, ainsi que le XML contenu dans un PDF Factur-X ou ZUGFeRD) au regard des règles listées sur notre site, explique chaque constat en français, en allemand ou en anglais clair et, lorsque la correction ne demande aucune information nouvelle, propose un fichier corrigé accompagné d'un comparatif des modifications (diff). Il conserve un historique des contrôles par société cliente. Il s'utilise depuis l'espace de travail ou par l'API.

## 3. Vous décidez de ce que vous envoyez

- **Les résultats proviennent uniquement des règles listées.** La conformité ou la non-conformité résulte de contrôles déterministes. Un résultat conforme signifie que le fichier a respecté les règles exécutées, telles que chaque résultat les liste ; il ne signifie pas qu'une administration fiscale, une plateforme de réception ou le client de votre client acceptera la facture, ni que la facture est exacte sur le fond (le traitement de TVA, les montants convenus, la réalité de la livraison ou de la prestation).
- **Les explications sont des aides.** Certaines explications sont rédigées par un modèle d'IA. Elles ne modifient jamais un résultat et peuvent être incomplètes ou erronées. Lisez la règle et le texte officiel lorsque l'enjeu le justifie.
- **Les corrections proposées sont des propositions.** Une correction n'est proposée que pour une courte liste de rectifications formelles, et seulement si le fichier corrigé respecte la règle visée sans nouveau constat. Vérifiez le diff avant d'envoyer un fichier corrigé à quiconque. Les totaux, les identifiants et les données commerciales manquantes ne sont jamais modifiés.
- **Aucun conseil fiscal, juridique ou comptable.** Rien dans le Service ne constitue un conseil fiscal, juridique, comptable ou financier. Vous et vos clients restez responsables des factures que vous émettez, recevez et archivez.

## 4. Comptes et clés d'API

Vous vous connectez avec une clé d'API. Elle est affichée une seule fois, lors de sa création, et nous n'en conservons qu'une empreinte (hash) ; nous ne pouvons donc ni l'afficher de nouveau ni la récupérer. Conservez vos clés en lieu sûr, révoquez une clé que vous n'utilisez plus ou qui a pu être exposée, et signalez-nous sans délai toute utilisation non autorisée. Vous êtes responsable de l'activité effectuée avec les clés de votre compte.

## 5. Formules, prix et facturation

- **Formules.** Un essai gratuit avec un quota mensuel est disponible sans carte. Les formules payantes, leurs prix et leurs limites (factures contrôlées, explications par IA, sociétés clientes, clés d'API) sont indiqués sur la page des tarifs et dans l'espace de travail avant l'achat. Une facture compte une seule fois par mois civil, quel que soit le nombre de contrôles.
- **Formule API à l'usage.** Dans la formule API à l'usage, le prix mensuel est un minimum, déduit de l'usage du mois aux tarifs indiqués avant l'achat. L'usage au-delà du minimum est facturé après la fin du mois, par le revendeur officiel, avec votre renouvellement suivant. L'usage et le montant du mois en cours sont affichés dans l'espace de travail et via l'API.
- **Revendeur officiel (merchant of record).** Les paiements sont traités par un revendeur officiel tiers (Paddle). Celui-ci est le vendeur de votre achat, gère le paiement, la facturation et la TVA ou la sales tax applicable, et ses propres conditions s'appliquent à l'opération de paiement.
- **Changement de formule et résiliation.** Vous pouvez changer ou résilier une formule payante à tout moment depuis le portail client accessible dans l'espace de travail. La résiliation met fin aux renouvellements futurs ; vous conservez la formule payante jusqu'à la fin de la période payée, puis les limites de l'essai s'appliquent. Si nous modifions nos prix, nous vous en informons à l'avance et la modification s'applique à partir de votre période de facturation suivante.
- **Remboursements.** Si une formule payante ne vous convient pas, vous pouvez demander un remboursement intégral dans les 30 jours suivant votre premier paiement d'abonnement, en nous contactant ou en répondant au reçu du revendeur officiel. Les remboursements sont effectués sur le moyen de paiement d'origine. Les renouvellements ultérieurs ne sont en principe pas remboursables, sauf lorsque la loi l'exige ou en cas d'erreur de facturation ou d'interruption prolongée, que nous examinerons de bonne foi. Le quota non utilisé n'est pas reporté.

## 6. Utilisation acceptable

Vous ne nous envoyez que des factures que vous êtes en droit de traiter, pour vous-même ou pour des clients qui vous ont mandaté. Vous n'utilisez pas le Service pour enfreindre la loi, pour sonder ou attaquer le Service ou d'autres systèmes, pour contourner les limites de formule ou de débit (par exemple avec de nombreux comptes d'essai), ni pour revendre un accès brut à l'API sans notre accord écrit.

## 7. Votre contenu

- **Votre contenu vous appartient** : les factures que vous envoyez, votre liste de clients, ainsi que les résultats et fichiers corrigés produits pour vous.
- Vous nous accordez une licence limitée et non exclusive pour traiter votre contenu **uniquement dans la mesure nécessaire pour fournir, sécuriser et assister le Service** à votre profit. Les factures sont traitées en mémoire pour produire un résultat et ne sont pas conservées ; l'historique contient les noms de fichiers, les empreintes SHA-256, les identifiants de règles et de corrections.
- Nous ne vendons pas votre contenu, ne l'utilisons pas à des fins publicitaires, ne le partageons pas avec d'autres clients et ne l'utilisons pas pour entraîner des modèles d'IA. Voir la Politique de confidentialité.
- **Données personnelles dans votre contenu.** Lorsque nous traitons des données personnelles pour votre compte (par exemple les noms, adresses ou numéros de TVA de personnes figurant dans les factures de vos clients) et que ce traitement relève du RGPD de l'UE, du UK GDPR ou du droit suisse de la protection des données, l'**accord de sous-traitance** (Data Processing Agreement) publié à l'adresse /app/dpa fait partie des présentes conditions et s'applique sans signature. Il comprend les clauses contractuelles types de l'UE pour le transfert vers nous aux États-Unis.

## 8. Confidentialité

Nous traitons votre contenu non public, y compris les noms et numéros de TVA de vos clients, de manière confidentielle. Nous ne l'utilisons que pour fournir le Service, ne le partageons qu'avec les sous-traitants listés dans la Politique de confidentialité qui en ont besoin, et le protégeons par des mesures raisonnables. Nous pouvons divulguer des informations si la loi l'exige, et vous en informerons au préalable lorsque la loi nous le permet.

## 9. Disponibilité

Nous nous efforçons de maintenir le Service disponible, mais il peut être interrompu pour maintenance ou par des événements indépendants de notre volonté. Conservez vos propres copies des factures que vous émettez et de tout fichier corrigé que vous utilisez ; le Service n'est pas un outil d'archivage.

## 10. Fin du contrat

Vous pouvez cesser d'utiliser le Service et résilier à tout moment. Nous pouvons suspendre ou clôturer les comptes qui enfreignent les présentes conditions, ou en cas de défaut de paiement, avec un préavis lorsque c'est possible.

## 11. Exclusion de garanties

Le Service est fourni « en l'état » et « selon disponibilité ». Dans la mesure permise par la loi, nous excluons les garanties implicites, notamment de qualité marchande, d'adéquation à un usage particulier et d'absence de contrefaçon. Rien dans les présentes conditions ne limite les droits auxquels la loi ne permet pas de renoncer.

## 12. Limitation de responsabilité

Dans la mesure permise par la loi, aucune des parties n'est responsable des dommages indirects, accessoires, spéciaux, consécutifs ou punitifs, ni des pertes de bénéfices, de chiffre d'affaires ou de données, y compris les pertes liées à une facture rejetée, payée en retard ou redressée par une administration fiscale. Notre responsabilité totale pour toute réclamation relative au Service est limitée aux **sommes que vous nous avez versées au cours des 12 mois précédant la naissance de la réclamation**. Ces limites ne s'appliquent pas à la responsabilité qui ne peut être limitée par la loi, notamment en cas de faute intentionnelle ou de faute lourde lorsque cette règle s'applique.

## 13. Modification des présentes conditions

Nous pouvons mettre à jour les présentes conditions. Nous publierons la nouvelle version avec une nouvelle date de version et, pour les modifications importantes, vous en informerons à l'avance dans l'espace de travail. Nous enregistrons la version acceptée par chaque compte.

## 14. Droit applicable

Les présentes conditions sont régies par le droit de l'**État du Colorado**, États-Unis, sans égard aux règles de conflit de lois. Les tribunaux situés au Colorado sont compétents pour les litiges, sauf si le droit impératif du lieu de votre établissement en dispose autrement.

## 15. Contact

Maris Stella Labs LLC, Colorado, États-Unis · hello@marisstella.app
