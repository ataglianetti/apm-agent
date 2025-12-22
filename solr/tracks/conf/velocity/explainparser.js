/**
 * Solr Explain parser
 */
var ExplainParser = function (explainStructure, roundTo) {
  this._init(explainStructure, roundTo);
};

ExplainParser.prototype = {
  _init: function (explainStructure, roundTo) {
    this.roundTo = Math.pow(10, roundTo);
    this.out = {};
    this.out.total = explainStructure.value;
    this.out.boost = {
      type: 'none',
    };
    if (
      /^sum\sof:$/.test(explainStructure.description) &&
      /^FunctionQuery/.test(
        explainStructure.details[explainStructure.details.length - 1].description
      )
    ) {
      this.out.boost.type = 'bf';
      this.out.boost.naturalScore =
        explainStructure.details[explainStructure.details.length - 1].details[0].value;
      this.out.boost.contributedScore =
        explainStructure.details[explainStructure.details.length - 1].value;
      this.out.boost.percentOfTotal = (this.out.boost.contributedScore / this.out.total) * 100;
      this.out.boost.formula =
        explainStructure.details[explainStructure.details.length - 1].description;
    } else if (/^boost.+?product\sof:$/.test(explainStructure.description)) {
      this.out.boost.type = 'boost';
      this.out.boost.naturalScore =
        explainStructure.details[explainStructure.details.length - 1].value;
      this.out.boost.contributedScore = this.out.boost.naturalScore;
      this.out.boost.formula =
        explainStructure.details[explainStructure.details.length - 1].description;
    }
    var tieVal = this._recurseFindTie(explainStructure);
    if (typeof tieVal == 'string') {
      this.out.tie = Number(tieVal);
    } else {
      this.out.tie = 0;
    }
    this.out.byFieldTerm = this._recurseFindFieldTerms(explainStructure);
    this.out.byField = [];
    this.out.byTerm = [];
    this.out.byPhrase = [];

    var fields = {};
    var terms = {};
    for (var x = 0; x < this.out.byFieldTerm.length; x++) {
      if (!fields[this.out.byFieldTerm[x].field]) {
        fields[this.out.byFieldTerm[x].field] = {
          field: this.out.byFieldTerm[x].field,
          naturalScore: 0,
          contributedScore: 0,
        };
      }
      if (!terms[this.out.byFieldTerm[x].term]) {
        terms[this.out.byFieldTerm[x].term] = {
          term: this.out.byFieldTerm[x].term,
          naturalScore: 0,
          contributedScore: 0,
        };
      }
      fields[this.out.byFieldTerm[x].field].naturalScore += this.out.byFieldTerm[x].naturalScore;
      fields[this.out.byFieldTerm[x].field].contributedScore +=
        this.out.byFieldTerm[x].contributedScore;
      terms[this.out.byFieldTerm[x].term].naturalScore += this.out.byFieldTerm[x].naturalScore;
      terms[this.out.byFieldTerm[x].term].contributedScore +=
        this.out.byFieldTerm[x].contributedScore;
    }
    for (var term in terms) {
      if (term.indexOf(' ') == -1) {
        this.out.byTerm.push(terms[term]);
      } else {
        this.out.byPhrase.push(terms[term]);
      }
    }
    for (var field in fields) {
      this.out.byField.push(fields[field]);
    }

    this._applyBoost(this.out.byFieldTerm);
    this._applyBoost(this.out.byField);
    this._applyBoost(this.out.byTerm);
    this._applyBoost(this.out.byPhrase);

    this.out.totalContributedFieldScore = 0;
    for (var x = 0; x < this.out.byFieldTerm.length; x++) {
      this.out.totalContributedFieldScore += this.out.byFieldTerm[x].contributedScore;
    }

    this._applyPercentOfTotal(this.out.byFieldTerm);
    this._applyPercentOfTotal(this.out.byField);
    this._applyPercentOfTotal(this.out.byTerm);
    this._applyPercentOfTotal(this.out.byPhrase);
  },

  setRoundTo: function (aRoundTo) {
    this.roundTo = Math.pow(10, aRoundTo);
  },

  _recurseFindTie: function (node) {
    // if (node.description.startsWith('max')) {
    if (node.description.indexOf('max') == 0) {
      var tieMatches = /max\splus\s([\d\.]+)\stimes/.exec(node.description);
      if (tieMatches) {
        return tieMatches[1];
      } else {
        return false;
      }
    } else {
      if (node.details) {
        var out = null;
        for (var x = 0; x < node.details.length; x++) {
          out = this._recurseFindTie(node.details[x]);
          if (out !== null) {
            return out;
          }
        }
      }
    }
    return null;
  },

  _recurseFindFieldTerms: function (node) {
    if (
      /^\*:\*, product of:$|^(\w+):\*, product of:$|^weight\((\w+):"(.+?)"|^weight\(([\w\*]+):([^\s\^]+)/.test(
        node.description
      )
    ) {
      var match = /^\*:\*|^(\w+):\*|^weight\((\w+):"(.+?)"|^weight\(([\w\*]+):([^\s\^]+)/.exec(
        node.description
      );
      if (match) {
        if (match[1]) {
          return [
            {
              field: match[1],
              term: '*',
              naturalScore: node.value,
              contributedScore: node.value,
            },
          ];
        } else if (match[2]) {
          return [
            {
              field: match[2],
              term: match[3],
              naturalScore: node.value,
              contributedScore: node.value,
            },
          ];
        } else if (match[4]) {
          return [
            {
              field: match[4],
              term: match[5],
              naturalScore: node.value,
              contributedScore: node.value,
            },
          ];
        } else {
          return [
            {
              field: '*',
              term: '*',
              naturalScore: node.value,
              contributedScore: node.value,
            },
          ];
        }
      }
    } else {
      var out = [];
      var sources = [];
      if (node.details) {
        for (var x = 0; x < node.details.length; x++) {
          sources[x] = this._recurseFindFieldTerms(node.details[x]);
        }
        //if (node.description.startsWith('max')) {
        if (node.description.indexOf('max') == 0) {
          var maxScore = 0;
          var maxScoreSource = -1;
          for (var x = 0; x < sources.length; x++) {
            var sourceScore = 0;
            for (var y = 0; y < sources[x].length; y++) {
              sourceScore += sources[x][y].contributedScore;
            }
            if (maxScore < sourceScore) {
              maxScore = sourceScore;
              maxScoreSource = x;
            }
          }
          for (var x = 0; x < sources.length; x++) {
            if (x != maxScoreSource) {
              for (var y = 0; y < sources[x].length; y++) {
                sources[x][y].contributedScore = sources[x][y].naturalScore * this.out.tie;
              }
            }
            out = out.concat(sources[x]);
          }
        } else {
          for (var x = 0; x < sources.length; x++) {
            out = out.concat(sources[x]);
          }
        }
      }
      return out;
    }
  },

  getResults: function () {
    var boostObj = this._copyObject(this.out.boost);
    if (boostObj.type == 'bf') {
      boostObj.percentOfTotal = Math.round(boostObj.percentOfTotal * this.roundTo) / this.roundTo;
    }
    if (boostObj.type != 'none') {
      boostObj.naturalScore = Math.round(boostObj.naturalScore * this.roundTo) / this.roundTo;
      boostObj.contributedScore =
        Math.round(boostObj.contributedScore * this.roundTo) / this.roundTo;
    }

    return {
      total: Math.round(this.out.total * this.roundTo) / this.roundTo,
      totalContributedFieldScore:
        Math.round(this.out.totalContributedFieldScore * this.roundTo) / this.roundTo,
      boost: this.out.boost,
      tie: this.out.tie,
      byField: this._getRoundedFields(this.out.byField),
      byTerm: this._getRoundedFields(this.out.byTerm),
      byPhrase: this._getRoundedFields(this.out.byPhrase),
      byFieldTerm: this._getRoundedFields(this.out.byFieldTerm),
    };
  },

  _getRoundedFields: function (theData) {
    var out = [];
    for (var x = 0; x < theData.length; x++) {
      var field = this._copyObject(theData[x]);
      field.naturalScore = Math.round(field.naturalScore * this.roundTo) / this.roundTo;
      field.contributedScore = Math.round(field.contributedScore * this.roundTo) / this.roundTo;
      field.boostedScore = Math.round(field.boostedScore * this.roundTo) / this.roundTo;
      field.percentOfTotal = Math.round(field.percentOfTotal * this.roundTo) / this.roundTo;
      out.push(field);
    }
    return out;
  },

  _copyObject: function (theData) {
    var out = {};
    for (var x in theData) {
      out[x] = theData[x];
    }
    return out;
  },

  _applyBoost: function (theData) {
    if (this.out.boost.type == 'boost') {
      for (var x = 0; x < theData.length; x++) {
        theData[x].boostedScore = theData[x].contributedScore * this.out.boost.naturalScore;
      }
    } else {
      for (var x = 0; x < theData.length; x++) {
        theData[x].boostedScore = theData[x].contributedScore;
      }
    }
  },

  _applyPercentOfTotal: function (theData) {
    for (var x = 0; x < theData.length; x++) {
      theData[x].percentOfTotal = (theData[x].boostedScore / this.out.total) * 100;
    }
  },
};
